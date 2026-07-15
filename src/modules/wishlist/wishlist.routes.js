import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { wishlistProductSchema } from './wishlist.validation.js';
import {
  getWishlist,
  addWishlistItem,
  removeWishlistItem,
  clearWishlist,
} from './wishlist.controller.js';

const router = Router();

router.use(protect);

router.get('/', getWishlist);
router.post('/items', validate(wishlistProductSchema), addWishlistItem);
router.delete('/items/:productId', removeWishlistItem);
router.delete('/', clearWishlist);

export default router;
