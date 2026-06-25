import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import path from 'path';

// GET /api/users/me
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  res.json({ success: true, data: user });
});

// PUT /api/users/me
// Allowed fields: name, avatar, phone, location ONLY.
// email  → requires a dedicated secure email-change flow (not this endpoint).
// plan   → controlled exclusively by the Billing/Subscription system.
// password, role, firebaseUid → never accepted here.
export const updateMe = asyncHandler(async (req, res) => {
  const { name, avatar, phone, location } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (avatar !== undefined) updates.avatar = avatar;
  if (phone !== undefined) updates.phone = phone;
  if (location !== undefined) updates.location = location;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true, select: '-password' }
  );

  if (!user) throw new ApiError(404, 'User not found');

  res.json({ success: true, data: user });
});

// POST /api/users/me/avatar
// Dedicated avatar upload endpoint.
// Reuses the existing multer upload middleware (diskStorage → uploads/).
// The middleware must run before this handler (configured in user.routes.js).
export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No image file provided. Please upload a JPG, JPEG, or PNG.');
  }

  // Build a publicly accessible URL for the uploaded avatar.
  // Express serves /uploads as static files (configured in app.js).
  const avatarUrl = `/uploads/${req.file.filename}`;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { avatar: avatarUrl } },
    { new: true, select: '-password' }
  );

  if (!user) throw new ApiError(404, 'User not found');

  res.json({ success: true, data: { avatar: avatarUrl, user } });
});
