import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { checkoutCartSchema, listOrdersQuerySchema } from './orders.validation.js';
import { checkoutCart, listOrders, getOrderById } from './orders.controller.js';

const router = Router();

router.use(protect);

router.post('/checkout/cart', validate(checkoutCartSchema), checkoutCart);
router.get('/', validateQuery(listOrdersQuerySchema), listOrders);
router.get('/:id', getOrderById);

export default router;
