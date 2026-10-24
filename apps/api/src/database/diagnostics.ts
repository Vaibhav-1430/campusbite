import { logger } from '../utils/logger.js';
import { prisma } from './prisma.js';

export type { DatabaseConnectionInfo } from './connection-url.js';
export {
  getSanitizedConnectionInfo,
  sanitizeAndEnhanceDbUrl
} from './connection-url.js';

import {
  getSanitizedConnectionInfo,
  sanitizeAndEnhanceDbUrl
} from './connection-url.js';

/**
 * Runs safe, non-destructive startup diagnostics testing database connectivity.
 * Emits sanitized diagnostic logs without logging credentials or query parameters.
 */
export const runDatabaseStartupDiagnostics = async (
  rawUrl: string
): Promise<{ connected: boolean; latencyMs?: number; error?: string }> => {
  const info = getSanitizedConnectionInfo(rawUrl);

  logger.info(
    `Database target: ${info.provider}://${info.host}:${info.port}/${info.database} [SSL: ${
      info.sslMode || 'none'
    }, Pooled: ${info.isPooled}, Neon: ${info.isNeon}, PgBouncer: ${info.hasPgBouncer}, ConnectTimeout: ${
      info.connectTimeoutSeconds ? `${info.connectTimeoutSeconds}s` : 'default'
    }]`,
    'DatabaseDiagnostics'
  );

  const startTime = Date.now();
  try {
    // 10-second bounded timeout for initial probe
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Initial database connection probe timed out after 10000ms')), 10000)
      )
    ]);

    const latencyMs = Date.now() - startTime;
    logger.info(`Database connectivity verified successfully in ${latencyMs}ms.`, 'DatabaseDiagnostics');
    return { connected: true, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    // Sanitize any potential user/pass in error string
    const rawMessage = err?.message || String(err);
    const sanitizedError = rawMessage.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');

    logger.error(
      `Database connectivity check FAILED after ${latencyMs}ms: ${sanitizedError}`,
      'DatabaseDiagnostics',
      {
        host: info.host,
        port: info.port,
        isNeon: info.isNeon,
        isPooled: info.isPooled,
        errorCode: err?.code
      }
    );

    if (info.isNeon) {
      logger.warn(
        'Neon Diagnostic Hints: (1) Ensure Neon compute is active and not suspended. (2) Ensure connection string includes sslmode=require and connect_timeout=30. (3) If password contains special characters, ensure it is properly URL-encoded in Render dashboard. (4) For Prisma runtime queries with pooled endpoint, ensure hostname has -pooler and pgbouncer=true.',
        'DatabaseDiagnostics'
      );
    }

    return { connected: false, latencyMs, error: sanitizedError };
  }
};
