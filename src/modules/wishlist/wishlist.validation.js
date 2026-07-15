import { z } from 'zod';

export const wishlistProductSchema = z.object({
  productId: z.string().trim().min(1, 'Product id is required'),
});
