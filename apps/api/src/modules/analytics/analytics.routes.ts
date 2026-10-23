import { Router } from 'express';
import { Role } from '@campusbite/shared';
import * as analyticsController from './analytics.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// All analytics and reporting routes strictly require authenticated ADMIN role
router.use(authenticate, requireRole([Role.ADMIN]));

router.get('/summary', analyticsController.getSalesSummary);
router.get('/menu-performance', analyticsController.getMenuPerformance);
router.get('/kitchen-performance', analyticsController.getKitchenPerformance);
router.get('/inventory', analyticsController.getInventoryReport);
router.get('/daily-closing', analyticsController.getDailyClosingReport);

// CSV Export Endpoints
router.get('/export/sales', analyticsController.exportSalesCsv);
router.get('/export/menu', analyticsController.exportMenuCsv);
router.get('/export/daily-closing', analyticsController.exportDailyClosingCsv);

export default router;
