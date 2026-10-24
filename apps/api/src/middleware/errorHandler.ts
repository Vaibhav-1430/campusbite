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
  if (err instanceof AppError || (typeof (err as any)?.statusCode === 'number' && typeof (err as any)?.code === 'string')) {
    const statusCode = (err as any).statusCode || 500;
    const code = (err as any).code || 'INTERNAL_SERVER_ERROR';
    if (statusCode >= 500) {
      logger.error(err.message, 'ErrorHandler', { path: req.path, stack: err.stack });
    }
    return sendError(res, code, err.message, statusCode, (err as any).details);
  }

  // 2. Zod Validation Error
  if (err instanceof ZodError || err.name === 'ZodError' || Array.isArray((err as any)?.issues)) {
    const issues = (err as any).issues || (err as any).errors || [];
    const details = issues.map((e: any) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
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
