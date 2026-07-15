import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { addCartItemSchema, updateCartItemSchema } from './cart.validation.js';
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
} from './cart.controller.js';

const router = Router();

router.use(protect);

router.get('/', getCart);
router.post('/items', validate(addCartItemSchema), addCartItem);
router.patch('/items/:itemId', validate(updateCartItemSchema), updateCartItem);
router.delete('/items/:itemId', removeCartItem);
router.delete('/', clearCart);

export default router;
