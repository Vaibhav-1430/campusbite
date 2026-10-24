import { Router } from 'express';
import * as authController from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { loginRateLimiter } from '../../middleware/rateLimiter.js';
import { MethodNotAllowedError } from '../../utils/errors.js';

const router = Router();

router.post('/login', loginRateLimiter, authController.login);
router.all('/login', (req, res, next) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return next(new MethodNotAllowedError('Login requires a POST request with credentials.', 'METHOD_NOT_ALLOWED'));
  }
  next();
});

router.post('/logout', authController.logout);
router.all('/logout', (req, res, next) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return next(new MethodNotAllowedError('Logout requires a POST request.', 'METHOD_NOT_ALLOWED'));
  }
  next();
});

router.get('/me', authenticate, authController.getMe);
router.all('/me', (req, res, next) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return next(new MethodNotAllowedError('Session lookup requires a GET request.', 'METHOD_NOT_ALLOWED'));
  }
  next();
});

export default router;
