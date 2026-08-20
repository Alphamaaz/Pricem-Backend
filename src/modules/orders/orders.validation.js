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

const optionalUrl = z.string().trim().max(1000).refine((value) => {
  if (!value) return true;
  if (value.startsWith('/uploads/')) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'Must be a valid HTTP(S) URL or upload path');

export const deliveryArrangementSchema = z.object({
  courierName: z.string().trim().min(1, 'Courier or logistics provider is required').max(120),
  externalCost: z.coerce.number().min(0, 'Delivery cost cannot be negative').optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const shipmentSchema = z.object({
  courierName: z.string().trim().min(1, 'Courier or logistics provider is required').max(120),
  trackingNumber: z.string().trim().max(200).optional(),
  trackingUrl: optionalUrl.optional(),
  estimatedDeliveryAt: z.coerce.date().optional(),
  proofUrl: optionalUrl.optional(),
});

export const listOrdersQuerySchema = z.object({
  role: z.enum(['buyer', 'seller']).optional(),
  status: z.enum(['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'completed', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
