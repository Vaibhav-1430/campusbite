import { Request, Response, NextFunction } from 'express';
import { COOKIE_NAME, verifyToken } from '../utils/token.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { prisma } from '../database/prisma.js';

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;

    // Check HTTP-only cookie first
    if (req.cookies && req.cookies[COOKIE_NAME]) {
      token = req.cookies[COOKIE_NAME];
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required. No session found.');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired authentication token', 'TOKEN_EXPIRED');
    }

    // Verify user in database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        tokenVersion: true
      }
    });

    if (!user) {
      throw new UnauthorizedError('User account not found', 'USER_NOT_FOUND');
    }

    // Check account status
    if (!user.isActive) {
      throw new ForbiddenError(
        'Your staff account has been deactivated. Please contact an administrator.',
        'ACCOUNT_DEACTIVATED'
      );
    }

    // Check session invalidation / token version
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedError('Session has been revoked. Please log in again.', 'SESSION_REVOKED');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
