import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import {
  getNavigationSummary,
  registerFcm,
  unregisterFcm,
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  testPushNotification,
} from './notifications.controller.js';

const router = Router();

router.use(protect);

router.get('/navigation-summary', getNavigationSummary);
router.post('/fcm-token', registerFcm);
router.delete('/fcm-token', unregisterFcm);
router.get('/', listNotifications);
router.patch('/read-all', markAllNotificationsAsRead);
router.patch('/:id/read', markNotificationAsRead);
router.post('/test', testPushNotification);

export default router;
