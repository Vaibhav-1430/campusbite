import { Router } from 'express';
import * as trackingController from './tracking.controller.js';

const router = Router();

// Public customer tracking routes (rate-limited, no staff auth required)
router.post('/verify', trackingController.verifyOrder);
router.get('/status', trackingController.getTrackingStatus);
router.get('/board', trackingController.getPublicBoard);

// Support requirements.md alias: /api/v1/orders/track
export const trackingOrderAliasHandler = trackingController.verifyOrder;

export default router;
