import { z } from 'zod';

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1, 'Message cannot be empty').max(1500, 'Message cannot exceed 1500 characters'),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().trim().optional(),
});

export const listConversationsQuerySchema = z.object({
  scope: z.enum(['listing', 'order']).optional(),
  status: z.enum(['open', 'closed', 'read_only']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
