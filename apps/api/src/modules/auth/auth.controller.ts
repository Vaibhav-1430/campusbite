import { Request, Response, NextFunction } from 'express';
import { loginSchema } from '@campusbite/shared';
import * as authService from './auth.service.js';
import { COOKIE_NAME, getCookieOptions } from '../../utils/token.js';
import { sendSuccess } from '../../utils/response.js';
import { logAudit } from '../audit/audit.service.js';

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
    if (req.user) {
      await logAudit({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'USER_LOGOUT',
        entityType: 'User',
        entityId: req.user.id,
        ipAddress: req.ip || req.socket.remoteAddress
      });
    }

    // Clear HTTP-only cookie
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
