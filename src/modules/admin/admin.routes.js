import { Router } from 'express';
import { protect, requireRole } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { rejectSellerSchema, listUsersQuerySchema } from './admin.validation.js';
import {
  getPendingApplications,
  approveSeller,
  rejectSeller,
  getAllUsers,
  getAdminAnalytics,
  toggleUserStatus,
  hideQuestion,
} from './admin.controller.js';

const router = Router();

router.use(protect, requireRole('admin'));

router.get('/analytics', getAdminAnalytics);
router.get('/users', validateQuery(listUsersQuerySchema), getAllUsers);
router.patch('/users/:userId/toggle-status', toggleUserStatus);
router.get('/sellers/pending', getPendingApplications);
router.patch('/sellers/:userId/approve', approveSeller);
router.patch('/sellers/:userId/reject', validate(rejectSellerSchema), rejectSeller);
router.patch('/questions/:questionId/hide', hideQuestion);

export default router;

