import { Router } from 'express';
import { Role } from '@campusbite/shared';
import * as orderController from './order.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// All order endpoints require staff authentication
router.use(authenticate);

// List and Get Orders (all staff roles)
router.get('/', requireRole([Role.COUNTER, Role.ADMIN, Role.KITCHEN]), orderController.listOrders);
router.get('/:id', requireRole([Role.COUNTER, Role.ADMIN, Role.KITCHEN]), orderController.getOrder);

// Create Order (Counter and Admin only)
router.post('/', requireRole([Role.COUNTER, Role.ADMIN]), orderController.createOrder);

// Claim Order (Kitchen staff and Admin only)
router.post('/:id/claim', requireRole([Role.KITCHEN, Role.ADMIN]), orderController.claimOrder);
router.patch('/:id/claim', requireRole([Role.KITCHEN, Role.ADMIN]), orderController.claimOrder);

// Explicitly Assign Order (Counter staff and Admin only)
router.post('/:id/assign', requireRole([Role.COUNTER, Role.ADMIN]), orderController.assignOrder);
router.patch('/:id/assign', requireRole([Role.COUNTER, Role.ADMIN]), orderController.assignOrder);

// Start Preparation (Kitchen staff and Admin only)
router.post('/:id/start-prep', requireRole([Role.KITCHEN, Role.ADMIN]), orderController.startPreparation);
router.patch('/:id/start-prep', requireRole([Role.KITCHEN, Role.ADMIN]), orderController.startPreparation);

// Adjust Preparation Time (Kitchen staff and Admin only)
router.post('/:id/adjust-time', requireRole([Role.KITCHEN, Role.ADMIN]), orderController.adjustPreparationTime);
router.patch('/:id/adjust-time', requireRole([Role.KITCHEN, Role.ADMIN]), orderController.adjustPreparationTime);

// Mark Prepared (Kitchen staff and Admin only)
router.post('/:id/prepared', requireRole([Role.KITCHEN, Role.ADMIN]), orderController.markPrepared);
router.patch('/:id/prepared', requireRole([Role.KITCHEN, Role.ADMIN]), orderController.markPrepared);

// Handover to Customer (Counter staff and Admin only)
router.post('/:id/handover', requireRole([Role.COUNTER, Role.ADMIN]), orderController.markHandover);
router.patch('/:id/handover', requireRole([Role.COUNTER, Role.ADMIN]), orderController.markHandover);

// Cancel Order (Counter staff and Admin only; Kitchen rejected)
router.post('/:id/cancel', requireRole([Role.COUNTER, Role.ADMIN]), orderController.cancelOrder);
router.patch('/:id/cancel', requireRole([Role.COUNTER, Role.ADMIN]), orderController.cancelOrder);

export default router;
