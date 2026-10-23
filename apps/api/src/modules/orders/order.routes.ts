import { Router } from 'express';
import { Role } from '@campusbite/shared';
import * as orderController from './order.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// All order endpoints require staff authentication
router.use(authenticate);

// Counter and Admin order endpoints
router.post('/', requireRole([Role.COUNTER, Role.ADMIN]), orderController.createOrder);
router.get('/', requireRole([Role.COUNTER, Role.ADMIN, Role.KITCHEN]), orderController.listOrders);
router.get('/:id', requireRole([Role.COUNTER, Role.ADMIN, Role.KITCHEN]), orderController.getOrder);
router.post('/:id/handover', requireRole([Role.COUNTER, Role.ADMIN]), orderController.markHandover);
router.post('/:id/cancel', requireRole([Role.COUNTER, Role.ADMIN]), orderController.cancelOrder);

export default router;
