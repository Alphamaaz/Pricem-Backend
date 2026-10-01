import { z } from 'zod';

export const registerSchema = z.object({
  fullName:      z.string().trim().min(1, 'Full name is required'),
  email:         z.string().trim().toLowerCase().email('Valid email is required'),
  contactNumber: z.string().trim().min(1, 'Contact number is required'),
  password:      z.string().min(6, 'Password must be at least 6 characters'),
});

export const verifyEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required'),
  otp:   z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required'),
});

export const loginSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required'),
});

export const resetPasswordSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Valid email is required'),
  otp:      z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword:     z.string().min(6, 'New password must be at least 6 characters'),
});
