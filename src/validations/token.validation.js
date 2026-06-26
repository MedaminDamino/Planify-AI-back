import { z } from 'zod';

export const buyTokensSchema = z.object({
  packId: z
    .string({ required_error: 'packId is required' })
    .refine((val) => ['starter', 'standard', 'pro', 'ultimate'].includes(val), {
      message: 'Invalid packId',
    }),
});
