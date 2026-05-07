import Payment from '../models/Payment.js';
import User from '../models/User.js';
import TokenTransaction from '../models/TokenTransaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/payments
export const getPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: payments.length, data: payments });
});

// POST /api/payments/demo
export const createDemoPayment = asyncHandler(async (req, res) => {
  const { amount, type, description, tokenAmount, subscriptionId } = req.body;

  if (!amount || !type) {
    throw new ApiError(400, 'Amount and type are required');
  }

  const invoiceNumber = `INV-${Date.now()}`;

  const payment = await Payment.create({
    userId: req.user._id,
    subscriptionId: subscriptionId || undefined,
    amount,
    currency: 'USD',
    status: 'paid',
    type,
    provider: 'demo',
    tokenAmount: tokenAmount || 0,
    description: description || 'Demo payment',
    paidAt: new Date(),
    invoiceNumber,
  });

  // If token pack, credit tokens to user
  if (type === 'token_pack' && tokenAmount > 0) {
    const user = await User.findById(req.user._id);
    const balanceBefore = user.tokenBalance;
    user.tokenBalance += tokenAmount;
    await user.save({ validateBeforeSave: false });

    await TokenTransaction.create({
      userId: user._id,
      type: 'purchase',
      amount: tokenAmount,
      reason: 'Token pack purchase (demo)',
      balanceBefore,
      balanceAfter: user.tokenBalance,
      paymentId: payment._id,
    });
  }

  res.status(201).json({ success: true, data: payment });
});
