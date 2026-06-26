import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
const dateString = z
  .string()
  .trim()
  .min(1, 'Date is required')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid date');

export const aiDailyPlanSchema = z.object({
  date: z.string().trim().optional(),
  focusHours: z.coerce.number().int().min(1).max(16).optional(),
  courseIds: z.array(objectId).max(20).optional(),
});

export const aiSummarizeFileSchema = z
  .object({
    fileId: objectId.optional(),
    courseId: objectId.optional(),
    text: z.string().trim().max(10000).optional(),
  })
  .refine((value) => Boolean(value.fileId || value.courseId || value.text), {
    message: 'Provide fileId, courseId, or text',
  });

export const aiGenerateExercisesSchema = z.object({
  courseId: objectId.optional(),
  topic: z.string().trim().min(1).max(200).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  count: z.coerce.number().int().min(1).max(20).optional(),
});

export const aiPrioritizeTasksSchema = z.object({
  taskIds: z.array(objectId).max(50).optional(),
  courseId: objectId.optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const aiRevisionPlanSchema = z
  .object({
    courseId: objectId.optional(),
    examId: objectId.optional(),
  })
  .refine((value) => Boolean(value.courseId || value.examId), {
    message: 'Provide courseId or examId',
  });

export const aiChatSchema = z.object({
  message: z
    .string({ required_error: 'Message is required' })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message must be at most 2000 characters'),
  courseId: objectId.optional(),
  fileId: objectId.optional(),
  recentMessages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(4000),
    type: z.enum(['chat', 'summary', 'exercises', 'daily_plan', 'prioritize_tasks', 'revision_plan']).optional(),
  })).max(10).optional(),
});

export const aiDashboardRecommendationsSchema = z.object({
  date: dateString.optional(),
});

// Backward-compatible aliases for older imports.
export const dailyPlanSchema = aiDailyPlanSchema;
export const summarizeSchema = aiSummarizeFileSchema;
export const generateExercisesSchema = aiGenerateExercisesSchema;
export const chatSchema = aiChatSchema;
