import { Request, Response, NextFunction } from 'express';
import { COOKIE_NAME, verifyToken, getCookieOptions } from '../utils/token.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { prisma } from '../database/prisma.js';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;
    let tokenSource: 'bearer' | 'cookie' | undefined;

    const authHeader = req.headers.authorization;
    const hasBearer = Boolean(authHeader && authHeader.startsWith('Bearer '));
    const hasCookie = Boolean(req.cookies && req.cookies[COOKIE_NAME]);

    // 1. Prefer an explicitly supplied Authorization: Bearer token
    if (hasBearer) {
      token = authHeader!.split(' ')[1];
      tokenSource = 'bearer';
    } else if (hasCookie) {
      // 2. Use session cookie only when no Bearer token is supplied
      token = req.cookies[COOKIE_NAME];
      tokenSource = 'cookie';
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required. No session found.');
    }

    // Helper to safely clear the session cookie on authentication failures
    const clearSessionCookie = () => {
      res.clearCookie(COOKIE_NAME, {
        ...getCookieOptions(),
        maxAge: 0
      });
    };

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      // Clear cookie if cookie was the credential or if cookie is present on failure
      if (tokenSource === 'cookie' || hasCookie) {
        clearSessionCookie();
      }
      throw new UnauthorizedError('Invalid or expired authentication token', 'TOKEN_EXPIRED');
    }

    if (!payload || !payload.userId || (payload as any).type === 'tracking') {
      if (tokenSource === 'cookie' || hasCookie) {
        clearSessionCookie();
      }
      throw new UnauthorizedError('Invalid staff authentication token', 'INVALID_STAFF_TOKEN');
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
      // Missing or deleted user: clear cookie to stop repeated 401 loops
      clearSessionCookie();
      throw new UnauthorizedError('User account not found', 'USER_NOT_FOUND');
    }

    // Check account status
    if (!user.isActive) {
      clearSessionCookie();
      throw new ForbiddenError(
        'Your staff account has been deactivated. Please contact an administrator.',
        'ACCOUNT_DEACTIVATED'
      );
    }

    // Check session invalidation / token version
    if (user.tokenVersion !== payload.tokenVersion) {
      clearSessionCookie();
      throw new UnauthorizedError('Session has been revoked. Please log in again.', 'SESSION_REVOKED');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
