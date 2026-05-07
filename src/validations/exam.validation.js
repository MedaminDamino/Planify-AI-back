import { z } from 'zod';

const examType     = ['exam', 'quiz', 'test', 'tp', 'td', 'presentation', 'other'];
const examPriority = ['low', 'medium', 'high'];
const examStatus   = ['upcoming', 'completed', 'missed'];
const objectId     = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

export const createExamSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, 'Title cannot be empty')
    .max(200, 'Title must be at most 200 characters'),

  examDate: z.coerce.date({ required_error: 'Exam date is required' }),

  description:      z.string().trim().max(1000).optional(),
  courseId:         objectId.optional(),
  startTime:        z.string().trim().optional(),
  endTime:          z.string().trim().optional(),
  location:         z.string().trim().max(100).optional(),
  type:             z.enum(examType).optional(),
  priority:         z.enum(examPriority).optional(),
  revisionProgress: z.number().min(0).max(100).optional(),
  status:           z.enum(examStatus).optional(),
  topics:           z.array(z.string().trim()).optional(),
  notes:            z.string().trim().max(2000).optional(),
});

export const updateExamSchema = createExamSchema.partial();
