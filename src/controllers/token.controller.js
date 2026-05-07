import User from '../models/User.js';
import TokenTransaction from '../models/TokenTransaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/tokens/balance
export const getBalance = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('tokenBalance');
  res.json({ success: true, data: { tokenBalance: user.tokenBalance } });
});

// GET /api/tokens/history
export const getHistory = asyncHandler(async (req, res) => {
  const transactions = await TokenTransaction.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: transactions.length, data: transactions });
});

// POST /api/tokens/buy-demo
export const buyDemoTokens = asyncHandler(async (req, res) => {
  const { amount } = req.body;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new ApiError(400, 'Provide a valid positive amount');
  }

  const user = await User.findById(req.user._id);
  const balanceBefore = user.tokenBalance;
  const balanceAfter = balanceBefore + amount;

  user.tokenBalance = balanceAfter;
  await user.save({ validateBeforeSave: false });

  const transaction = await TokenTransaction.create({
    userId: user._id,
    type: 'purchase',
    amount,
    reason: 'Demo token purchase',
    balanceBefore,
    balanceAfter,
  });

  res.status(201).json({
    success: true,
    data: { tokenBalance: balanceAfter, transaction },
  });
});
