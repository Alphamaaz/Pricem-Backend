import { z } from 'zod';

const evidenceUrls = z.array(z.string().trim().url()).max(10).default([]);

export const openDisputeSchema = z.object({
  reason: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(3000),
  evidenceUrls: evidenceUrls.optional(),
});

export const disputeMessageSchema = z.object({
  message: z.string().trim().min(1).max(3000),
  evidenceUrls: evidenceUrls.optional(),
});

export const resolveDisputeSchema = z.object({
  outcome: z.enum(['full_refund', 'partial_refund', 'release_seller_payment', 'cancel_order']),
  amount: z.coerce.number().positive().optional(),
  decision: z.string().trim().min(5).max(3000),
}).superRefine((value, ctx) => {
  if (value.outcome === 'partial_refund' && value.amount === undefined) {
    ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Partial refund amount is required' });
  }
});

export const listDisputesQuerySchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
