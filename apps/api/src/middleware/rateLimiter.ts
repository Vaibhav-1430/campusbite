import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (record.resetAt <= now) {
      loginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

export const loginRateLimiter = (req: Request, _res: Response, next: NextFunction) => {
  // Use IP or X-Forwarded-For
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 10; // 10 attempts per window

  const record = loginAttempts.get(ip);

  if (!record || record.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (record.count >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
    return next(
      new AppError(
        `Too many login attempts. Please try again in ${retryAfterSeconds} seconds.`,
        429,
        'TOO_MANY_REQUESTS'
      )
    );
  }

  record.count += 1;
  next();
};

export const resetLoginAttempts = (ip: string) => {
  loginAttempts.delete(ip);
};
