import { z } from 'zod';

const taskStatus   = ['todo', 'in_progress', 'review', 'completed'];
const taskPriority = ['low', 'medium', 'high'];
const taskSource   = ['manual', 'ai', 'imported'];
const objectId     = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, 'Title cannot be empty')
    .max(200, 'Title must be at most 200 characters'),

  description:       z.string().trim().max(1000).optional(),
  courseId:          objectId.optional(),
  status:            z.enum(taskStatus).optional(),
  priority:          z.enum(taskPriority).optional(),
  deadline:          z.coerce.date().optional(),
  estimatedDuration: z.number().int().min(1).optional(),
  actualDuration:    z.number().int().min(0).optional(),
  progress:          z.number().min(0).max(100).optional(),
  aiSuggested:       z.boolean().optional(),
  source:            z.enum(taskSource).optional(),
  completedAt:       z.coerce.date().optional(),
  tags:              z.array(z.string().trim()).optional(),
});

export const updateTaskSchema = createTaskSchema.partial();
