import { Request, Response, NextFunction } from 'express';
import { loginSchema } from '@campusbite/shared';
import * as authService from './auth.service.js';
import { COOKIE_NAME, getCookieOptions, verifyToken } from '../../utils/token.js';
import { sendSuccess } from '../../utils/response.js';
import { logAudit } from '../audit/audit.service.js';
import { prisma } from '../../database/prisma.js';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedInput = loginSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress;

    const { token, user } = await authService.login(validatedInput, ip);

    // Set secure HTTP-only cookie
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return sendSuccess(res, { user, token });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let currentUser = req.user;

    // If req.user is not already attached, attempt safe resolution for audit logging
    if (!currentUser) {
      let token: string | undefined;
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
      } else if (req.cookies && req.cookies[COOKIE_NAME]) {
        token = req.cookies[COOKIE_NAME];
      }

      if (token) {
        try {
          const payload = verifyToken(token);
          if (payload && payload.userId && (payload as any).type !== 'tracking') {
            const dbUser = await prisma.user.findUnique({
              where: { id: payload.userId },
              select: { id: true, role: true, isActive: true, tokenVersion: true }
            });
            if (dbUser && dbUser.isActive && dbUser.tokenVersion === payload.tokenVersion) {
              currentUser = dbUser as any;
            }
          }
        } catch {
          // Token is expired, invalid, or malformed; proceed to clear session without audit
        }
      }
    }

    if (currentUser) {
      await logAudit({
        actorId: currentUser.id,
        actorRole: currentUser.role,
        action: 'USER_LOGOUT',
        entityType: 'User',
        entityId: currentUser.id,
        ipAddress: req.ip || req.socket.remoteAddress
      });
    }

    // Always clear HTTP-only cookie with exact options
    res.clearCookie(COOKIE_NAME, {
      ...getCookieOptions(),
      maxAge: 0
    });

    return sendSuccess(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, { user: req.user });
  } catch (err) {
    next(err);
  }
};
