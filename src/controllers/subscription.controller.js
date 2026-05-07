import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

const PLAN_CONFIG = {
  student: {
    price: 9.99,
    tokenLimit: 50000,
    features: ['50,000 tokens/month', 'AI daily plans', 'File summaries', 'Exercise generation', 'Priority support'],
  },
  pro: {
    price: 19.99,
    tokenLimit: 150000,
    features: [
      '150,000 tokens/month',
      'Unlimited AI chat',
      'Advanced analytics',
      'Custom study plans',
      'Priority support',
      'API access',
    ],
  },
};

// GET /api/subscriptions/me
export const getSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: subscription });
});

// POST /api/subscriptions/demo-upgrade
export const demoUpgrade = asyncHandler(async (req, res) => {
  const { plan, billingCycle } = req.body;

  if (!plan || !['student', 'pro'].includes(plan)) {
    throw new ApiError(400, 'Plan must be "student" or "pro"');
  }

  const config = PLAN_CONFIG[plan];

  const endsAt =
    billingCycle === 'yearly'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const subscription = await Subscription.findOneAndUpdate(
    { userId: req.user._id },
    {
      plan,
      status: 'active',
      startedAt: new Date(),
      endsAt,
      nextBillingDate: endsAt,
      billingCycle: billingCycle || 'monthly',
      price: config.price,
      features: config.features,
      tokenLimit: config.tokenLimit,
      autoRenew: true,
    },
    { new: true, upsert: true }
  );

  // Update user plan
  await User.findByIdAndUpdate(req.user._id, { plan });

  res.json({ success: true, data: subscription });
});

// POST /api/subscriptions/cancel-demo
export const cancelDemoSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOneAndUpdate(
    { userId: req.user._id },
    { status: 'cancelled', autoRenew: false },
    { new: true }
  );

  if (!subscription) throw new ApiError(404, 'No active subscription found');

  await User.findByIdAndUpdate(req.user._id, { plan: 'free' });

  res.json({ success: true, data: subscription });
});
