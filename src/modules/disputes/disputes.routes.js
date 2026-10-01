import { Router } from 'express';
import { protect, requireRole } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { addDisputeMessage, getDispute, listDisputes, openDispute, resolveDispute } from './disputes.controller.js';
import { disputeMessageSchema, listDisputesQuerySchema, openDisputeSchema, resolveDisputeSchema } from './disputes.validation.js';
import { uploadOrderEvidence } from '../../middlewares/upload.middleware.js';

const router = Router();
router.use(protect);
router.get('/', validateQuery(listDisputesQuerySchema), listDisputes);
router.post('/orders/:orderId', uploadOrderEvidence, validate(openDisputeSchema), openDispute);
router.get('/:id', getDispute);
router.post('/:id/messages', uploadOrderEvidence, validate(disputeMessageSchema), addDisputeMessage);
router.patch('/:id/resolve', requireRole('admin'), validate(resolveDisputeSchema), resolveDispute);
export default router;
