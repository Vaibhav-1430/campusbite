import { Request, Response, NextFunction } from 'express';
import { Role } from '@campusbite/shared';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export const requireRole = (allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Role ${req.user.role} does not have required permissions.`,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
};
