import { z } from 'zod';

const eventType      = ['course', 'td', 'tp', 'exam', 'study_session', 'task', 'break', 'personal', 'other'];
const eventStatus    = ['scheduled', 'completed', 'cancelled'];
const recurrenceFreq = ['daily', 'weekly', 'monthly', 'none'];
const objectId       = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

const recurrenceSchema = z.object({
  enabled:    z.boolean().optional(),
  frequency:  z.enum(recurrenceFreq).optional(),
  daysOfWeek: z.array(z.string()).optional(),
  until:      z.coerce.date().optional(),
}).optional();

export const createScheduleSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, 'Title cannot be empty')
    .max(200, 'Title must be at most 200 characters'),

  type:  z.enum(eventType, { required_error: 'Type is required' }),
  start: z.coerce.date({ required_error: 'Start date is required' }),
  end:   z.coerce.date({ required_error: 'End date is required' }),

  description: z.string().trim().max(1000).optional(),
  courseId:    objectId.optional(),
  taskId:      objectId.optional(),
  examId:      objectId.optional(),
  location:    z.string().trim().max(100).optional(),
  color:       z.string().optional(),
  recurrence:  recurrenceSchema,
  aiSuggested: z.boolean().optional(),
  status:      z.enum(eventStatus).optional(),
}).refine((data) => data.end > data.start, {
  message: 'End must be after start',
  path: ['end'],
});

export const updateScheduleSchema = z.object({
  title:       z.string().trim().min(1).max(200).optional(),
  type:        z.enum(eventType).optional(),
  start:       z.coerce.date().optional(),
  end:         z.coerce.date().optional(),
  description: z.string().trim().max(1000).optional(),
  courseId:    objectId.optional(),
  taskId:      objectId.optional(),
  examId:      objectId.optional(),
  location:    z.string().trim().max(100).optional(),
  color:       z.string().optional(),
  recurrence:  recurrenceSchema,
  aiSuggested: z.boolean().optional(),
  status:      z.enum(eventStatus).optional(),
});
