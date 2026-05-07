import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// GET /api/users/me
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  res.json({ success: true, data: user });
});

// PUT /api/users/me
export const updateMe = asyncHandler(async (req, res) => {
  const { name, avatar, plan } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name, avatar, plan },
    { new: true, runValidators: true, select: '-password' }
  );

  res.json({ success: true, data: user });
});
