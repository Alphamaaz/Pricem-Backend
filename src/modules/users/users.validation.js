import { z } from 'zod';

export const switchRoleSchema = z.object({
  role: z.enum(['buyer', 'seller'], { message: 'Role must be buyer or seller' }),
});

export const sellerApplySchema = z.object({
  storeName:     z.string().trim().min(1, 'Store name is required'),
  storeSlug:     z.string().trim().optional(),
  description:   z.string().trim().optional(),
  bankName:      z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  accountName:   z.string().trim().optional(),
});

export const updateProfileSchema = z.object({
  fullName:      z.string().trim().min(1, 'Name cannot be empty').optional(),
  contactNumber: z.string().trim().min(5, 'Valid contact number required').optional(),
  description:   z.string().trim().optional(),
  bankName:      z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  accountName:   z.string().trim().optional(),
});
