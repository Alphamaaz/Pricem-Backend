import { Router } from 'express';
import { protect, requireRole } from '../../middlewares/auth.middleware.js';
import {
  listCategories,
  adminListCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './category.controller.js';

const router = Router();

// Public route: list active categories
router.get('/', listCategories);

// Admin-only management endpoints
router.get('/admin', protect, requireRole('admin'), adminListCategories);
router.post('/admin', protect, requireRole('admin'), createCategory);
router.patch('/admin/:id', protect, requireRole('admin'), updateCategory);
router.delete('/admin/:id', protect, requireRole('admin'), deleteCategory);

export default router;
