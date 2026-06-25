import StudyPreference from '../models/StudyPreference.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { updateStudyPreferencesSchema } from '../validations/studyPreference.validation.js';

/** Default values mirroring the Mongoose schema defaults. */
const DEFAULT_PREFERENCES = {
  preferredStudyHours: 'Morning (8AM - 12PM)',
  preferredDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  focusSessionLength: 90,
  breakLength: 15,
  revisionStyle: 'Spaced Repetition',
  difficultyPreference: 'Balanced',
  examPreparationMode: 'Balanced (Learn & Practice)',
  language: 'English (US)',
  calendarDefaultView: 'Schedule View',
  themePreference: 'light',
  aiAssistantTone: 'Encouraging & Friendly',
  autoScheduleSessions: true,
  includeBufferTime: true,
  smartRescheduling: true,
  weekendStudy: false,
};

// ── GET /api/study-preferences/me ────────────────────────────────────────────
export const getStudyPreferences = asyncHandler(async (req, res) => {
  let prefs = await StudyPreference.findOne({ userId: req.user._id });

  // Auto-create document with defaults on first access
  if (!prefs) {
    prefs = await StudyPreference.create({
      userId: req.user._id,
      ...DEFAULT_PREFERENCES,
    });
  }

  res.json({ success: true, data: prefs });
});

// ── PUT /api/study-preferences/me ────────────────────────────────────────────
export const updateStudyPreferences = asyncHandler(async (req, res) => {
  const parsed = updateStudyPreferencesSchema.safeParse(req.body);

  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => e.message).join('; ');
    throw new ApiError(422, message);
  }

  const prefs = await StudyPreference.findOneAndUpdate(
    { userId: req.user._id },
    { $set: parsed.data },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, data: prefs });
});

// ── POST /api/study-preferences/reset ────────────────────────────────────────
export const resetStudyPreferences = asyncHandler(async (req, res) => {
  const prefs = await StudyPreference.findOneAndUpdate(
    { userId: req.user._id },
    { $set: DEFAULT_PREFERENCES },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, data: prefs });
});
