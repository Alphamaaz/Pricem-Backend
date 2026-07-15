import { z } from 'zod';

const variantSelectionSchema = z.object({
  name: z.string().trim().min(1, 'Variant name is required'),
  value: z.string().trim().min(1, 'Variant option value is required'),
});

export const createOfferSchema = z.object({
  productId: z.string().trim().min(1, 'Product id is required'),
  price: z.coerce.number().min(1, 'Offer price must be greater than 0'),
  variantSelections: z.array(variantSelectionSchema).optional(),
});

export const counterOfferSchema = z.object({
  price: z.coerce.number().min(1, 'Counter price must be greater than 0'),
});

export const listOffersQuerySchema = z.object({
  role: z.enum(['buyer', 'seller']).optional(),
  status: z.enum(['pending', 'countered', 'accepted', 'rejected', 'expired']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
