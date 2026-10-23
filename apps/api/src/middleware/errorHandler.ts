import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  // 1. Known AppError (Custom domain errors)
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, 'ErrorHandler', { path: req.path, stack: err.stack });
    }
    return sendError(res, err.code, err.message, err.statusCode, err.details);
  }

  // 2. Zod Validation Error
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message
    }));
    return sendError(res, 'VALIDATION_ERROR', 'Input validation failed', 400, details);
  }

  // 3. Prisma Known Request Error
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      return sendError(res, 'CONFLICT', `A record with this ${target} already exists.`, 409);
    }
    if (err.code === 'P2025') {
      return sendError(res, 'NOT_FOUND', 'Requested record not found in database.', 404);
    }
  }

  // 4. Fallback unhandled server error
  logger.error(err.message, 'UnhandledError', {
    path: req.path,
    method: req.method,
    stack: err.stack
  });

  return sendError(
    res,
    'INTERNAL_SERVER_ERROR',
    process.env.NODE_ENV === 'production' ? 'An unexpected internal error occurred' : err.message,
    500
  );
};
