import UserPreference from '../models/UserPreference.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// GET /api/preferences/me
export const getPreferences = asyncHandler(async (req, res) => {
  const prefs = await UserPreference.findOne({ userId: req.user._id });
  res.json({ success: true, data: prefs });
});

// PUT /api/preferences/me
export const updatePreferences = asyncHandler(async (req, res) => {
  const prefs = await UserPreference.findOneAndUpdate(
    { userId: req.user._id },
    req.body,
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ success: true, data: prefs });
});
