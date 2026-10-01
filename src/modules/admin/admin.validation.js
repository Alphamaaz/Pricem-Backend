import { z } from 'zod';

export const rejectSellerSchema = z.object({
  reason: z.string().trim().min(1, 'Rejection reason is required'),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  role: z.enum(['buyer', 'seller', 'admin']).optional(),
});
