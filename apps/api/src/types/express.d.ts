import { AuthSessionUser } from '@campusbite/shared';

declare global {
  namespace Express {
    interface Request {
      user?: AuthSessionUser & { tokenVersion: number; isActive: boolean };
    }
  }
}

export {};
