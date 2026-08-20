import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import {
  getConversation,
  getUnreadConversationCount,
  getOrderConversation,
  listConversations,
  listMessages,
  markConversationRead,
  openListingConversation,
  sendMessage,
} from './chat.controller.js';
import { listConversationsQuerySchema, listMessagesQuerySchema, sendMessageSchema } from './chat.validation.js';

const router = Router();

const messageRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user._id}:${req.params.id}`,
  message: { message: 'Too many messages. Please wait a moment before sending another one.' },
});

router.use(protect);
router.post('/products/:productId/conversation', openListingConversation);
router.get('/conversations', validateQuery(listConversationsQuerySchema), listConversations);
router.get('/conversations/unread-count', getUnreadConversationCount);
router.get('/orders/:orderId/conversation', getOrderConversation);
router.get('/conversations/:id', getConversation);
router.get('/conversations/:id/messages', validateQuery(listMessagesQuerySchema), listMessages);
router.patch('/conversations/:id/read', markConversationRead);
router.post('/conversations/:id/messages', messageRateLimit, validate(sendMessageSchema), sendMessage);

export default router;
