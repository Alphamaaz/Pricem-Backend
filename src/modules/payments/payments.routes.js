import { Router } from 'express';
import { protect, requireRole } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { getPayment, initializePayment, initiateRefund, verifyPayment } from './payments.controller.js';
import { initializePaymentSchema, refundPaymentSchema } from './payments.validation.js';

const router = Router();

router.use(protect);
router.post('/initialize', validate(initializePaymentSchema), initializePayment);
router.get('/:reference', getPayment);
router.get('/:reference/verify', verifyPayment);
router.post('/:paymentId/refund', requireRole('admin'), validate(refundPaymentSchema), initiateRefund);

export default router;
