import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL
      }
    },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
