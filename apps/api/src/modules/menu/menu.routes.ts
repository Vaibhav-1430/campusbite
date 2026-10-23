import { Router } from 'express';
import { Role } from '@campusbite/shared';
import * as menuController from './menu.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// Public / Staff read endpoints
router.get('/', menuController.listMenuItems);
router.get('/:id', menuController.getMenuItem);

// Availability toggle (Admin and Counter can toggle during shifts)
router.patch(
  '/:id/availability',
  authenticate,
  requireRole([Role.ADMIN, Role.COUNTER]),
  menuController.updateAvailability
);

// Admin-only management endpoints
router.post('/', authenticate, requireRole([Role.ADMIN]), menuController.createMenuItem);
router.put('/:id', authenticate, requireRole([Role.ADMIN]), menuController.updateMenuItem);
router.delete('/:id', authenticate, requireRole([Role.ADMIN]), menuController.deleteMenuItem);

export default router;
