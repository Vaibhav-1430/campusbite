import { Router } from 'express';
import { Role } from '@campusbite/shared';
import * as inventoryController from './inventory.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// Staff Read Endpoints (Overview, List, Item Detail)
router.get(
  '/overview',
  authenticate,
  requireRole([Role.ADMIN, Role.COUNTER, Role.KITCHEN]),
  inventoryController.getOverview
);

// Movement Ledger / Audit History (Admin only)
router.get(
  '/movements',
  authenticate,
  requireRole([Role.ADMIN]),
  inventoryController.listMovements
);

// List Stock Items (supports both / and /stock-items)
router.get(
  '/',
  authenticate,
  requireRole([Role.ADMIN, Role.COUNTER, Role.KITCHEN]),
  inventoryController.listStockItems
);
router.get(
  '/stock-items',
  authenticate,
  requireRole([Role.ADMIN, Role.COUNTER, Role.KITCHEN]),
  inventoryController.listStockItems
);

// Create Stock Item (supports both / and /stock-items)
router.post(
  '/',
  authenticate,
  requireRole([Role.ADMIN]),
  inventoryController.createStockItem
);
router.post(
  '/stock-items',
  authenticate,
  requireRole([Role.ADMIN]),
  inventoryController.createStockItem
);

// Get Stock Item Detail
router.get(
  '/stock-items/:id',
  authenticate,
  requireRole([Role.ADMIN, Role.COUNTER, Role.KITCHEN]),
  inventoryController.getStockItem
);
router.get(
  '/:id',
  authenticate,
  requireRole([Role.ADMIN, Role.COUNTER, Role.KITCHEN]),
  inventoryController.getStockItem
);

// Update Stock Item
router.put(
  '/stock-items/:id',
  authenticate,
  requireRole([Role.ADMIN]),
  inventoryController.updateStockItem
);
router.put(
  '/:id',
  authenticate,
  requireRole([Role.ADMIN]),
  inventoryController.updateStockItem
);

// Restock (Admin and Kitchen can log restocks)
router.post(
  '/stock-items/:id/restock',
  authenticate,
  requireRole([Role.ADMIN, Role.KITCHEN]),
  inventoryController.restock
);
router.post(
  '/:id/restock',
  authenticate,
  requireRole([Role.ADMIN, Role.KITCHEN]),
  inventoryController.restock
);

// Manual Adjustment / Waste / Discrepancy Correction (Admin only)
router.post(
  '/stock-items/:id/adjust',
  authenticate,
  requireRole([Role.ADMIN]),
  inventoryController.adjust
);
router.post(
  '/:id/adjust',
  authenticate,
  requireRole([Role.ADMIN]),
  inventoryController.adjust
);

export default router;
