import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { sanitizeAndEnhanceDbUrl } from './diagnostics.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const enhancedDbUrl = sanitizeAndEnhanceDbUrl(env.DATABASE_URL);

export const prisma =
  global.__prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: enhancedDbUrl
      }
    },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
