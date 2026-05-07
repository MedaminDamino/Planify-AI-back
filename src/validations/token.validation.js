import { z } from 'zod';

export const buyTokensSchema = z.object({
  amount: z
    .number({ required_error: 'Amount is required', invalid_type_error: 'Amount must be a number' })
    .int('Amount must be an integer')
    .min(100, 'Minimum purchase is 100 tokens')
    .max(1_000_000, 'Maximum purchase is 1,000,000 tokens'),
});
