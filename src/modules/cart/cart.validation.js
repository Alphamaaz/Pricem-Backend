import { z } from 'zod';

const variantSelectionSchema = z.object({
  name: z.string().trim().min(1, 'Variant name is required'),
  value: z.string().trim().min(1, 'Variant option value is required'),
});

export const addCartItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product id is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').default(1),
  variantSelections: z.array(variantSelectionSchema).optional(),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
});
