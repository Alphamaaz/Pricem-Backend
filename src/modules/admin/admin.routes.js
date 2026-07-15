import { Router } from 'express';
import { protect, requireRole } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { rejectSellerSchema, listUsersQuerySchema } from './admin.validation.js';
import { getPendingApplications, approveSeller, rejectSeller, getAllUsers } from './admin.controller.js';

const router = Router();

router.use(protect, requireRole('admin'));

router.get('/users',                          validateQuery(listUsersQuerySchema), getAllUsers);
router.get('/sellers/pending',                getPendingApplications);
router.patch('/sellers/:userId/approve',      approveSeller);
router.patch('/sellers/:userId/reject',       validate(rejectSellerSchema),        rejectSeller);

export default router;
