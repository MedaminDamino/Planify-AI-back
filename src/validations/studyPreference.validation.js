import { z } from 'zod';

const PREFERRED_STUDY_HOURS = [
  'Morning (8AM - 12PM)',
  'Afternoon (12PM - 4PM)',
  'Evening (4PM - 8PM)',
  'Night (8PM - 11PM)',
];

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const REVISION_STYLES = ['Spaced Repetition', 'Active Recall', 'Practice Tests'];

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

const FOCUS_SESSION_LENGTHS = [25, 45, 60, 90, 105, 120];
const BREAK_LENGTHS = [5, 10, 15, 20, 30];

export const updateStudyPreferencesSchema = z.object({
  preferredStudyHours: z.enum(PREFERRED_STUDY_HOURS).optional(),

  preferredDays: z
    .array(z.enum(DAYS_OF_WEEK))
    .min(0)
    .max(7)
    .optional(),

  focusSessionLength: z
    .number()
    .refine((v) => FOCUS_SESSION_LENGTHS.includes(v), {
      message: `focusSessionLength must be one of: ${FOCUS_SESSION_LENGTHS.join(', ')}`,
    })
    .optional(),

  breakLength: z
    .number()
    .refine((v) => BREAK_LENGTHS.includes(v), {
      message: `breakLength must be one of: ${BREAK_LENGTHS.join(', ')}`,
    })
    .optional(),

  revisionStyle: z.enum(REVISION_STYLES).optional(),

  difficultyPreference: z.enum(DIFFICULTY_PREFERENCES).optional(),

  examPreparationMode: z.enum(EXAM_PREPARATION_MODES).optional(),

  language: z.enum(LANGUAGES).optional(),

  calendarDefaultView: z.enum(CALENDAR_VIEWS).optional(),

  themePreference: z.enum(['light', 'dark']).optional(),

  aiAssistantTone: z.enum(AI_ASSISTANT_TONES).optional(),

  autoScheduleSessions: z.boolean().optional(),

  includeBufferTime: z.boolean().optional(),

  smartRescheduling: z.boolean().optional(),

  weekendStudy: z.boolean().optional(),
});
