import { z } from 'zod';
import { SELLER_REVIEW_TAGS } from './review.model.js';

const wordCount = (value) => value.trim().split(/\s+/u).filter(Boolean).length;
const rating = z.coerce.number().int().min(1).max(5);

export const itemReviewSchema = z.object({
  rating,
  text: z.string().trim().refine((value) => wordCount(value) >= 100, 'Item review must contain at least 100 words').refine((value) => wordCount(value) <= 2000, 'Item review cannot exceed 2,000 words'),
});

export const sellerReviewSchema = z.object({
  rating,
  tags: z.array(z.enum(SELLER_REVIEW_TAGS)).min(1, 'Select at least one seller adjective').max(5).transform((tags) => [...new Set(tags)]),
  text: z.string().trim().refine((value) => wordCount(value) <= 100, 'Seller review cannot exceed 100 words').optional().default(''),
});

export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
