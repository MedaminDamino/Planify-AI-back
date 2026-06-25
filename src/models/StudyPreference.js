import mongoose from 'mongoose';

/**
 * StudyPreference — stores one document per user containing all study-related
 * preferences. Separated from UserPreference to keep the schema cohesive and
 * to allow independent versioning of study settings.
 */
const PREFERRED_STUDY_HOURS = [
  'Morning (8AM - 12PM)',
  'Afternoon (12PM - 4PM)',
  'Evening (4PM - 8PM)',
  'Night (8PM - 11PM)',
];

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const REVISION_STYLES = [
  'Spaced Repetition',
  'Active Recall',
  'Practice Tests',
];

const DIFFICULTY_PREFERENCES = ['Balanced', 'Challenging', 'Step-by-step'];

const EXAM_PREPARATION_MODES = [
  'Balanced (Learn & Practice)',
  'Practice Heavy',
  'Revision Sprint',
];

const CALENDAR_VIEWS = ['Schedule View', 'Weekly View', 'Agenda View'];

const AI_ASSISTANT_TONES = [
  'Encouraging & Friendly',
  'Direct & Concise',
  'Coach-like',
];

const LANGUAGES = ['English (US)', 'French', 'Arabic', 'Spanish', 'German'];

const studyPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // ── Study schedule ────────────────────────────────────────────────────────
    preferredStudyHours: {
      type: String,
      enum: PREFERRED_STUDY_HOURS,
      default: 'Morning (8AM - 12PM)',
    },
    preferredDays: {
      type: [String],
      enum: DAYS_OF_WEEK,
      default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    },

    // ── Session timings ───────────────────────────────────────────────────────
    focusSessionLength: {
      type: Number,
      enum: [25, 45, 60, 90, 105, 120],
      default: 90,
    },
    breakLength: {
      type: Number,
      enum: [5, 10, 15, 20, 30],
      default: 15,
    },

    // ── Learning style ────────────────────────────────────────────────────────
    revisionStyle: {
      type: String,
      enum: REVISION_STYLES,
      default: 'Spaced Repetition',
    },
    difficultyPreference: {
      type: String,
      enum: DIFFICULTY_PREFERENCES,
      default: 'Balanced',
    },
    examPreparationMode: {
      type: String,
      enum: EXAM_PREPARATION_MODES,
      default: 'Balanced (Learn & Practice)',
    },

    // ── Display & localisation ────────────────────────────────────────────────
    language: {
      type: String,
      enum: LANGUAGES,
      default: 'English (US)',
    },
    calendarDefaultView: {
      type: String,
      enum: CALENDAR_VIEWS,
      default: 'Schedule View',
    },
    themePreference: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light',
    },

    // ── AI ────────────────────────────────────────────────────────────────────
    aiAssistantTone: {
      type: String,
      enum: AI_ASSISTANT_TONES,
      default: 'Encouraging & Friendly',
    },

    // ── Scheduling toggles ────────────────────────────────────────────────────
    autoScheduleSessions: { type: Boolean, default: true },
    includeBufferTime: { type: Boolean, default: true },
    smartRescheduling: { type: Boolean, default: true },
    weekendStudy: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('StudyPreference', studyPreferenceSchema);
