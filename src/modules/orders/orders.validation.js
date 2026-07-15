import { z } from 'zod';

const shippingAddressSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').optional(),
  phone: z.string().trim().min(1, 'Phone is required').optional(),
  addressLine1: z.string().trim().min(1, 'Address line 1 is required').optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().min(1, 'City is required').optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().min(1, 'Country is required').optional(),
});

export const checkoutCartSchema = z.object({
  shippingAddress: shippingAddressSchema.optional(),
});

export const listOrdersQuerySchema = z.object({
  role: z.enum(['buyer', 'seller']).optional(),
  status: z.enum(['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
