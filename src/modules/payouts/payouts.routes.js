import { Router } from 'express';
import { protect, requireRole } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { approvePayout, confirmPayout, listPayouts } from './payouts.controller.js';
import { confirmPayoutSchema, listPayoutsQuerySchema } from './payouts.validation.js';

const router = Router();
router.use(protect, requireRole('admin'));
router.get('/', validateQuery(listPayoutsQuerySchema), listPayouts);
router.patch('/:id/approve', approvePayout);
router.patch('/:id/confirm', validate(confirmPayoutSchema), confirmPayout);
export default router;
