import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { corsOptions } from './config/cors.js';
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
import { prisma } from './database/prisma.js';
import { sendSuccess } from './utils/response.js';

import { csrfProtection } from './middleware/csrf.js';

export const createApp = () => {
  const app = express();

  // Trust first proxy for correct client IP detection behind reverse proxies
  app.set('trust proxy', 1);

  // 1. CORS Configuration & Preflight Handling (Before all routes and parsing)
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // 2. Security Headers (Configured to permit cross-origin API consumption by frontend SPA)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );

  // Request Body & Cookie Parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(csrfProtection);

  // Health check endpoints (root /health for standard orchestrator probes and /api/v1/health)
  const healthCheckHandler = async (_req: express.Request, res: express.Response) => {
    const startTime = Date.now();
    try {
      // 4-second bounded timeout prevents hanging health probes behind reverse proxies
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database probe query timed out after 4000ms')), 4000)
        )
      ]);

      const latencyMs = Date.now() - startTime;
      return sendSuccess(res, {
        status: 'healthy',
        database: 'connected',
        latencyMs,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      }, 200);
    } catch {
      const latencyMs = Date.now() - startTime;
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_DEGRADED',
          message: 'Database connection failed'
        },
        meta: {
          status: 'degraded',
          database: 'disconnected',
          latencyMs,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  app.get('/health', healthCheckHandler);
  app.get('/api/v1/health', healthCheckHandler);

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
