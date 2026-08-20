import { z } from 'zod';

export const listPayoutsQuerySchema = z.object({
  status: z.enum(['eligible', 'held', 'approved', 'paid', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const confirmPayoutSchema = z.object({
  transferReference: z.string().trim().min(3).max(200),
  transferMethod: z.string().trim().min(2).max(120),
});
