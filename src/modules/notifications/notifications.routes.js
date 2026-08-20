import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { getNavigationSummary } from './notifications.controller.js';

const router = Router();
router.use(protect);
router.get('/navigation-summary', getNavigationSummary);
export default router;
