import { Router } from 'express';
import { Role } from '@campusbite/shared';
import * as userController from './user.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// All staff management routes require active ADMIN authentication
router.use(authenticate, requireRole([Role.ADMIN]));

router.get('/', userController.listUsers);
router.post('/', userController.createUser);
router.patch('/:id/status', userController.updateUserStatus);
router.post('/:id/reset-password', userController.resetPassword);

export default router;
