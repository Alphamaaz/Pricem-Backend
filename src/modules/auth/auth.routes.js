import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from './auth.validation.js';
import {
  register,
  verifyEmail,
  resendVerification,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
} from './auth.controller.js';

const router = Router();

router.post('/register',      validate(registerSchema),       register);
router.post('/verify-email',         validate(verifyEmailSchema),         verifyEmail);
router.post('/resend-verification',  validate(resendVerificationSchema),  resendVerification);
router.post('/login',         validate(loginSchema),          login);
router.post('/logout',        protect,                        logout);
router.post('/refresh-token',                                 refreshToken);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password',  validate(resetPasswordSchema),  resetPassword);
router.post('/change-password', protect, validate(changePasswordSchema), changePassword);
router.get('/me',             protect,                        getMe);

export default router;
