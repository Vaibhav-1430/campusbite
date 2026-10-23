import { Router } from 'express';
import { Role } from '@campusbite/shared';
import * as categoryController from './category.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// Public / Staff read categories
router.get('/', categoryController.listCategories);

// Admin-only category management
router.post('/', authenticate, requireRole([Role.ADMIN]), categoryController.createCategory);
router.patch('/:id', authenticate, requireRole([Role.ADMIN]), categoryController.updateCategory);
router.delete('/:id', authenticate, requireRole([Role.ADMIN]), categoryController.deleteCategory);

export default router;
