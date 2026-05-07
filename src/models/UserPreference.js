import mongoose from 'mongoose';

const userPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    language: {
      type: String,
      default: 'en',
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'light',
    },
    timezone: {
      type: String,
      default: 'Africa/Casablanca',
    },
    study: {
      preferredStudyHours: String,
      preferredDays: [String],
      focusSessionLength: {
        type: Number,
        default: 90,
      },
      breakLength: {
        type: Number,
        default: 15,
      },
      revisionStyle: {
        type: String,
        enum: ['spaced_repetition', 'active_recall', 'mixed'],
        default: 'spaced_repetition',
      },
      difficultyPreference: {
        type: String,
        enum: ['easy', 'balanced', 'challenging'],
        default: 'balanced',
      },
      examPreparationMode: {
        type: String,
        enum: ['learn', 'practice', 'balanced'],
        default: 'balanced',
      },
    },
    notifications: {
      general: { type: Boolean, default: true },
      aiStudyReminders: { type: Boolean, default: true },
      examAlerts: { type: Boolean, default: true },
      deadlineReminders: { type: Boolean, default: true },
      weeklySummaries: { type: Boolean, default: true },
      productivityInsights: { type: Boolean, default: true },
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: false },
      quietHours: {
        enabled: { type: Boolean, default: false },
        startTime: String,
        endTime: String,
      },
    },
    ai: {
      assistantTone: {
        type: String,
        enum: ['friendly', 'strict', 'balanced'],
        default: 'balanced',
      },
      responseDetail: {
        type: String,
        enum: ['short', 'medium', 'detailed'],
        default: 'detailed',
      },
      motivationBoosts: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('UserPreference', userPreferenceSchema);
