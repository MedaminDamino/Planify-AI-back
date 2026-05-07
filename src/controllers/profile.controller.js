import Profile from '../models/Profile.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// GET /api/profile/me
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await Profile.findOne({ userId: req.user._id });
  res.json({ success: true, data: profile });
});

// PUT /api/profile/me
export const updateProfile = asyncHandler(async (req, res) => {
  const allowed = [
    'fullName', 'bio', 'location', 'phone', 'university', 'program',
    'fieldOfStudy', 'academicYear', 'studentId', 'gpa', 'tags',
    'profileCompletion', 'socialLinks',
  ];

  const updates = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  const profile = await Profile.findOneAndUpdate(
    { userId: req.user._id },
    updates,
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, data: profile });
});
