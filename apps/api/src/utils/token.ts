import jwt from 'jsonwebtoken';
import { JwtPayload } from '@campusbite/shared';
import { env } from '../config/env.js';

export const COOKIE_NAME = 'campusbite_session';

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
  });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};

export const getCookieOptions = () => {
  const isProduction = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours in ms
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
  };
};

export interface TrackingJwtPayload {
  orderId: string;
  dailyOrderNumber: string;
  type: 'tracking';
}

export const generateTrackingToken = (orderId: string, dailyOrderNumber: string): string => {
  return jwt.sign({ orderId, dailyOrderNumber, type: 'tracking' }, env.JWT_SECRET, {
    expiresIn: '6h'
  });
};

export const verifyTrackingToken = (token: string): TrackingJwtPayload => {
  const payload = jwt.verify(token, env.JWT_SECRET) as any;
  if (payload.type !== 'tracking' || !payload.orderId) {
    throw new Error('Invalid tracking token');
  }
  return payload as TrackingJwtPayload;
};

