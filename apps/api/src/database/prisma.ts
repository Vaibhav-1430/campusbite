import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { sanitizeAndEnhanceDbUrl } from './diagnostics.js';
import { assertSafeTestDatabase } from './safety-guard.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const enhancedDbUrl = sanitizeAndEnhanceDbUrl(env.DATABASE_URL);

// FAIL-CLOSED SAFETY GUARD:
// If running in test mode, assert that the target database is an approved isolated test database
// BEFORE Prisma client is instantiated or any query can execute.
if (env.NODE_ENV === 'test') {
  assertSafeTestDatabase(enhancedDbUrl, 'PrismaClient initialization');
}

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
