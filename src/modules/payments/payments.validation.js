import { z } from 'zod';

export const initializePaymentSchema = z.object({
  orderIds: z.array(z.string().trim().min(1)).min(1).max(50),
});

export const refundPaymentSchema = z.object({
  orderId: z.string().trim().min(1),
  amount: z.coerce.number().positive().optional(),
  reason: z.string().trim().min(1).max(500),
});
