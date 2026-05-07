import { z } from 'zod';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/png',
  'image/jpeg',
];

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

/**
 * Validates optional metadata fields sent alongside a multipart upload.
 * The actual file binary is validated by multer (upload.middleware.js).
 */
export const uploadMetaSchema = z.object({
  courseId:    objectId.optional(),
  description: z.string().trim().max(500).optional(),
  tags: z
    .union([
      z.array(z.string().trim()),
      z.string().transform((s) => s.split(',').map((t) => t.trim()).filter(Boolean)),
    ])
    .optional(),
});
