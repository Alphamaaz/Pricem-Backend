import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { uploadProductImages, attachUploadedProductImages } from '../../middlewares/upload.middleware.js';
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from './products.validation.js';
import {
  createProduct,
  listProducts,
  listMyProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} from './products.controller.js';

const router = Router();

function requireApprovedSeller(req, res, next) {
  if (
    !req.user.roles.includes('seller') ||
    req.user.sellerProfile?.approvalStatus !== 'approved'
  ) {
    return res.status(403).json({ message: 'Only approved sellers can manage products' });
  }

  next();
}

router.get('/', validateQuery(listProductsQuerySchema), listProducts);
router.get('/mine', protect, requireApprovedSeller, listMyProducts);
router.post('/', protect, requireApprovedSeller, uploadProductImages, attachUploadedProductImages, validate(createProductSchema), createProduct);
router.get('/:id', getProductById);
router.patch('/:id', protect, requireApprovedSeller, uploadProductImages, attachUploadedProductImages, validate(updateProductSchema), updateProduct);
router.delete('/:id', protect, requireApprovedSeller, deleteProduct);

export default router;
