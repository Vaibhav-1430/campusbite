import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';
import { env } from '../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfProtection = (req: Request, _res: Response, next: NextFunction) => {
  // Safe read-only methods do not modify server state
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.headers.origin;
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

  // In production, when an Origin header is present on state-changing requests,
  // it must match the allowed origin allowlist
  if (origin) {
    const isAllowed =
      allowedOrigins.includes(origin) ||
      (env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:'));

    if (!isAllowed) {
      return next(
        new ForbiddenError(
          `Cross-Site Request Forgery (CSRF) blocked: Origin ${origin} is not permitted.`,
          'CSRF_BLOCKED'
        )
      );
    }
  }

  next();
};
