import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
const aiType   = ['daily_plan', 'summary', 'exercises', 'chat', 'priority', 'flashcards', 'exam_prep'];

export const dailyPlanSchema = z.object({
  date:        z.string().optional(),
  focusHours:  z.number().min(1).max(16).optional(),
  courseIds:   z.array(objectId).optional(),
});

export const summarizeSchema = z.object({
  fileId:   objectId.optional(),
  courseId: objectId.optional(),
  text:     z.string().trim().max(10000).optional(),
});

export const generateExercisesSchema = z.object({
  courseId:   objectId.optional(),
  topic:      z.string().trim().max(200).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  count:      z.number().int().min(1).max(20).optional(),
});

export const chatSchema = z.object({
  message:  z
    .string({ required_error: 'Message is required' })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message must be at most 2000 characters'),

  courseId: objectId.optional(),
});
