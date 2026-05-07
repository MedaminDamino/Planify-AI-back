import { z } from 'zod';

const courseStatus = ['active', 'archived', 'completed'];
const coursePriority = ['low', 'medium', 'high'];

export const createCourseSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, 'Title cannot be empty')
    .max(120, 'Title must be at most 120 characters'),

  description: z.string().trim().max(500).optional(),
  semester:    z.string().trim().max(50).optional(),
  teacher:     z.string().trim().max(100).optional(),
  room:        z.string().trim().max(50).optional(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex code').optional(),
  icon:        z.string().trim().optional(),

  status:   z.enum(courseStatus).optional(),
  priority: z.enum(coursePriority).optional(),

  progress: z.number().min(0).max(100).optional(),
  tags:     z.array(z.string().trim()).optional(),
});

export const updateCourseSchema = createCourseSchema.partial();
