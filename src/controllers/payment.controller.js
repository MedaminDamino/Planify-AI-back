import Payment from '../models/Payment.js';
import PaymentMethod from '../models/PaymentMethod.js';
import User from '../models/User.js';
import TokenTransaction from '../models/TokenTransaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { TOKEN_PACKS } from './token.controller.js';

const stripe = new Stripe(env.stripeSecretKey || 'sk_test_placeholder_key_please_replace_with_actual_stripe_key');

async function syncPaymentMethodFromCheckoutSession(session, sourceLabel = 'Stripe Sync') {
  console.log(`[${sourceLabel}] session.id: ${session.id}`);
  console.log(`[${sourceLabel}] session.mode: ${session.mode}`);
  console.log(`[${sourceLabel}] session.customer: ${session.customer}`);
  console.log(`[${sourceLabel}] session.setup_intent: ${session.setup_intent}`);

  if (session.mode !== 'setup') {
    throw new ApiError(400, `Session mode is not setup: ${session.mode}`);
  }

  const stripeCustomerId = session.customer;
  if (!stripeCustomerId) {
    throw new ApiError(400, 'Missing session.customer');
  }

  const userId = session.metadata?.userId || session.client_reference_id;
  console.log(`[${sourceLabel}] resolved userId: ${userId}`);
  if (!userId) {
    throw new ApiError(400, 'Missing resolved userId');
  }

  let user = await User.findById(userId);
  if (!user) {
    user = await User.findOne({ stripeCustomerId });
  }

  if (!user) {
    throw new ApiError(400, `User mapping failed for userId=${userId} and stripeCustomerId=${stripeCustomerId}`);
  }

  console.log(`[${sourceLabel}] mapped user: ${user.email} (ID: ${user._id})`);

  if (!user.stripeCustomerId && stripeCustomerId) {
    user.stripeCustomerId = stripeCustomerId;
    await user.save({ validateBeforeSave: false });
    console.log(`[${sourceLabel}] updated customerId ${stripeCustomerId} on user`);
  }

  if (!session.setup_intent) {
    throw new ApiError(400, 'Missing session.setup_intent');
  }

  const setupIntentId = typeof session.setup_intent === 'string' ? session.setup_intent : session.setup_intent.id;
  const setupIntent = typeof session.setup_intent === 'string'
    ? await stripe.setupIntents.retrieve(setupIntentId)
    : session.setup_intent;

  console.log(`[${sourceLabel}] setupIntent.payment_method: ${setupIntent.payment_method}`);

  const stripePaymentMethodId = setupIntent.payment_method;
  if (!stripePaymentMethodId) {
    throw new ApiError(400, 'Missing payment_method in setupIntent');
  }

  const paymentMethodObj = await stripe.paymentMethods.retrieve(stripePaymentMethodId);
  if (!paymentMethodObj.card) {
    throw new ApiError(400, 'Retrieved payment method has no card details');
  }

  console.log(`[${sourceLabel}] retrieved paymentMethod: brand=${paymentMethodObj.card.brand}, last4=${paymentMethodObj.card.last4}`);

  const brand = paymentMethodObj.card.brand || 'Card';
  const last4 = paymentMethodObj.card.last4;
  const expMonth = paymentMethodObj.card.exp_month;
  const expYear = paymentMethodObj.card.exp_year;

  if (!last4 || !expMonth || !expYear) {
    throw new ApiError(400, `Missing card metadata on Stripe payment method ${stripePaymentMethodId}`);
  }

  const expiry = `${String(expMonth).padStart(2, '0')}/${String(expYear).slice(-2)}`;
  const brandName = brand.charAt(0).toUpperCase() + brand.slice(1);
  const label = `${brandName} ending in ${last4}`;

  const existingMethod = await PaymentMethod.findOne({ stripePaymentMethodId });
  if (existingMethod) {
    console.warn(
      `[${sourceLabel}] duplicate detection: existing PaymentMethod found for stripePaymentMethodId=${stripePaymentMethodId}, existingId=${existingMethod._id}, existingUserId=${existingMethod.userId}`
    );
  }

  const userMethodCount = await PaymentMethod.countDocuments({ userId: user._id });
  const isDefault = existingMethod ? Boolean(existingMethod.isDefault || userMethodCount <= 1) : userMethodCount === 0;

  const method = await PaymentMethod.findOneAndUpdate(
    { stripePaymentMethodId },
    {
      $set: {
        userId: user._id,
        stripeCustomerId,
        brand: brandName,
        label,
        expiry,
        last4,
        expMonth,
        expYear,
        isDefault,
      },
      $setOnInsert: {
        stripePaymentMethodId,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  const action = existingMethod ? 'updated' : 'created';
  console.log(
    `[${sourceLabel}] ${action} PaymentMethod document: id=${method._id}, userId=${method.userId}, stripeCustomerId=${method.stripeCustomerId}, stripePaymentMethodId=${method.stripePaymentMethodId}, isDefault=${method.isDefault}`
  );

  if (isDefault && stripeCustomerId) {
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: stripePaymentMethodId
      }
    });
    console.log(`[${sourceLabel}] set default_payment_method to ${stripePaymentMethodId} on customer ${stripeCustomerId}`);
  }

  return {
    synced: true,
    userId: user._id.toString(),
    stripeCustomerId,
    stripePaymentMethodId,
    paymentMethodId: method._id.toString(),
    isDefault: method.isDefault
  };
}

// GET /api/payments
export const getPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: payments.length, data: payments });
});

// GET /api/payments/methods
export const getPaymentMethods = asyncHandler(async (req, res) => {
  const allMethods = await PaymentMethod.find({ userId: req.user._id }).sort({ updatedAt: -1 });
  
  const uniqueMethods = [];
  const seenIds = new Set();
  const seenLabels = new Set(); // fallback for old records
  let duplicateCount = 0;

  for (const method of allMethods) {
    let isDuplicate = false;
    
    if (method.stripePaymentMethodId) {
      if (seenIds.has(method.stripePaymentMethodId)) {
        isDuplicate = true;
        console.warn(`[GET Methods] Duplicate Stripe payment method detected for userId=${req.user._id}, stripePaymentMethodId=${method.stripePaymentMethodId}, recordId=${method._id}`);
      } else {
        seenIds.add(method.stripePaymentMethodId);
      }
    } else {
      // Fallback deduplication for old/mock records
      const labelKey = `${method.brand}-${method.last4 || method.label}`;
      if (seenLabels.has(labelKey)) {
        isDuplicate = true;
        console.warn(`[GET Methods] Duplicate legacy payment method detected for userId=${req.user._id}, labelKey=${labelKey}, recordId=${method._id}`);
      } else {
        seenLabels.add(labelKey);
      }
    }

    if (isDuplicate) {
      duplicateCount += 1;
    } else {
      uniqueMethods.push(method);
    }
  }

  // Sort: default card first, then latest updated first
  uniqueMethods.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return b.updatedAt - a.updatedAt;
  });

  console.log(`[GET Methods] Authenticated userId: ${req.user._id}, found unique count: ${uniqueMethods.length}, duplicateCount: ${duplicateCount}`);

  res.json({ success: true, count: uniqueMethods.length, data: uniqueMethods });
});

// POST /api/payments/setup-session
export const createSetupSession = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  let stripeCustomerId = user.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: user._id.toString() }
    });
    stripeCustomerId = customer.id;
    user.stripeCustomerId = stripeCustomerId;
    await user.save({ validateBeforeSave: false });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'setup',
    customer: stripeCustomerId,
    success_url: `${env.clientUrl || 'http://localhost:3000'}/settings/billing/manage-subscription?session_id={CHECKOUT_SESSION_ID}&stripe_success=true`,
    cancel_url: `${env.clientUrl || 'http://localhost:3000'}/settings/billing/manage-subscription?stripe_cancel=true`,
    metadata: { userId: user._id.toString() },
    client_reference_id: user._id.toString()
  });

  res.json({ success: true, url: session.url });
});

// POST /api/payments/verify-setup-session
export const verifySetupSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) throw new ApiError(400, 'sessionId is required');

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const result = await syncPaymentMethodFromCheckoutSession(session, 'Stripe Verify');
    res.json({ success: true, data: result });
  } catch (err) {
    console.error(`[Stripe Verify] Failed to sync session ${sessionId}: ${err.message}`);
    throw err;
  }
});

// POST /api/payments/set-default-method
export const setDefaultPaymentMethod = asyncHandler(async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ApiError(400, 'Payment method ID is required');

  const method = await PaymentMethod.findOne({ _id: id, userId: req.user._id });
  if (!method) throw new ApiError(404, 'Payment method not found or not owned by user');

  const user = await User.findById(req.user._id);
  if (!user || !user.stripeCustomerId) throw new ApiError(400, 'Stripe customer not found');

  await stripe.customers.update(user.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: method.stripePaymentMethodId
    }
  });

  await PaymentMethod.updateMany({ userId: req.user._id, isDefault: true }, { isDefault: false });
  method.isDefault = true;
  await method.save();

  res.json({ success: true, data: method });
});

// DELETE /api/payments/methods/:id
export const deletePaymentMethod = asyncHandler(async (req, res) => {
  const method = await PaymentMethod.findOne({ _id: req.params.id, userId: req.user._id });
  if (!method) {
    throw new ApiError(404, 'Payment method not found');
  }

  const user = await User.findById(req.user._id);

  try {
    if (method.stripePaymentMethodId) {
      await stripe.paymentMethods.detach(method.stripePaymentMethodId);
    }
  } catch (err) {
    console.error(`Stripe detach error: ${err.message}`);
  }

  await PaymentMethod.findByIdAndDelete(method._id);

  if (method.isDefault) {
    const nextMethod = await PaymentMethod.findOne({ userId: req.user._id });
    if (nextMethod) {
      nextMethod.isDefault = true;
      await nextMethod.save();
      
      if (user && user.stripeCustomerId) {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: nextMethod.stripePaymentMethodId
          }
        });
      }
    } else {
      if (user && user.stripeCustomerId) {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: ''
          }
        });
      }
    }
  }

  res.json({ success: true, data: { id: req.params.id } });
});

// POST /api/payments/demo
export const createDemoPayment = asyncHandler(async (req, res) => {
  const { packId } = req.body;

  if (!packId) {
    throw new ApiError(400, 'packId is required');
  }

  const pack = TOKEN_PACKS.find(p => p.id === packId);
  if (!pack) {
    throw new ApiError(400, 'Invalid packId');
  }

  const amount = pack.price;
  const tokenAmount = pack.tokens;
  const description = `${pack.name} (${pack.tokens.toLocaleString()} tokens)`;
  const type = 'token_pack';

  const invoiceNumber = `INV-${Date.now()}`;

  const payment = await Payment.create({
    userId: req.user._id,
    amount,
    currency: 'TND',
    status: 'paid',
    type,
    provider: 'demo',
    tokenAmount,
    description,
    paidAt: new Date(),
    invoiceNumber,
  });

  const user = await User.findById(req.user._id);
  const balanceBefore = user.tokenBalance;
  user.tokenBalance += tokenAmount;
  await user.save({ validateBeforeSave: false });

  await TokenTransaction.create({
    userId: user._id,
    type: 'purchase',
    amount: tokenAmount,
    reason: `Token pack purchase (${pack.name})`,
    balanceBefore,
    balanceAfter: user.tokenBalance,
    paymentId: payment._id,
  });

  res.status(201).json({ success: true, data: payment });
});
// POST /api/stripe/webhook (Unprotected, signature verified via constructEvent)
export const handleStripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, env.stripeWebhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Temporary log: event.type
  console.log(`[Stripe Webhook Debug] event.type: ${event.type}`);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      await syncPaymentMethodFromCheckoutSession(session, 'Stripe Webhook Debug');
    } catch (retrievalError) {
      console.error(`[Stripe Webhook Debug] Stripe retrieval/saving failed: ${retrievalError.message}`);
      return res.status(500).json({ error: retrievalError.message });
    }
  }

  res.json({ received: true });
});

// GET /api/payments/debug-methods (Authenticated)
export const getDebugMethods = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const stripeCustomerId = user ? user.stripeCustomerId : null;
  const methods = await PaymentMethod.find({ userId: req.user._id }).sort({ createdAt: -1 });

  const methodsList = methods.map(m => ({
    id: m._id,
    stripePaymentMethodId: m.stripePaymentMethodId,
    last4: m.last4,
    createdAt: m.createdAt
  }));

  res.json({
    success: true,
    userId: req.user._id,
    stripeCustomerId,
    count: methods.length,
    methods: methodsList
  });
});
