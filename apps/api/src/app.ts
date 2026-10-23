import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError, ForbiddenError } from './utils/errors.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import categoryRoutes from './modules/menu/category.routes.js';
import menuRoutes from './modules/menu/menu.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import trackingRoutes, { trackingOrderAliasHandler } from './modules/tracking/tracking.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import { sendSuccess } from './utils/response.js';

import { csrfProtection } from './middleware/csrf.js';

export const createApp = () => {
  const app = express();

  // Trust first proxy for correct client IP detection behind reverse proxies
  app.set('trust proxy', 1);

  // Security Headers
  app.use(helmet());

  // CORS Configuration
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
          callback(null, true);
        } else {
          callback(new ForbiddenError(`Origin ${origin} not allowed by CORS policy.`, 'CORS_NOT_ALLOWED'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Idempotency-Key']
    })
  );

  // Request Body & Cookie Parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(csrfProtection);

  // Health check endpoint
  app.get('/api/v1/health', (_req, res) => {
    return sendSuccess(res, { status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Feature Routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/categories', categoryRoutes);
  app.use('/api/v1/menu', menuRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1/kitchen/orders', orderRoutes);
  app.use('/api/v1/tracking', trackingRoutes);
  app.use('/api/v1/inventory', inventoryRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.post('/api/v1/orders/track', trackingOrderAliasHandler);

  // 404 Catch-All
  app.use((_req, _res, next) => {
    next(new NotFoundError('The requested API resource does not exist.', 'ROUTE_NOT_FOUND'));
  });

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
};
