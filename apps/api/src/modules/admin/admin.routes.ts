import { Router } from 'express';
import { Role } from '@campusbite/shared';
import * as adminController from './admin.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// All admin operations require active ADMIN authentication
router.use(authenticate, requireRole([Role.ADMIN]));

router.post('/reset-business-data', adminController.resetBusinessData);

export default router;
