import { logger } from '../utils/logger.js';
import { prisma } from './prisma.js';

export interface DatabaseConnectionInfo {
  provider: string;
  host: string;
  port: number;
  database: string;
  isPooled: boolean;
  isNeon: boolean;
  sslMode: string | null;
  hasConnectTimeout: boolean;
  connectTimeoutSeconds?: number;
  hasPgBouncer: boolean;
}

/**
 * Parses and returns connection metadata with all credentials (username, password, query tokens)
 * strictly removed to guarantee zero secret leakage in logs.
 */
export const getSanitizedConnectionInfo = (rawUrl: string): DatabaseConnectionInfo => {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname;
    const isNeon = hostname.endsWith('neon.tech') || hostname.includes('.neon.tech');
    const isPooled = hostname.includes('-pooler');

    return {
      provider: parsed.protocol.replace(':', ''),
      host: hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      database: parsed.pathname.replace(/^\//, '') || 'default',
      isPooled,
      isNeon,
      sslMode: parsed.searchParams.get('sslmode'),
      hasConnectTimeout: parsed.searchParams.has('connect_timeout'),
      connectTimeoutSeconds: parsed.searchParams.has('connect_timeout')
        ? parseInt(parsed.searchParams.get('connect_timeout')!, 10)
        : undefined,
      hasPgBouncer: parsed.searchParams.get('pgbouncer') === 'true'
    };
  } catch {
    return {
      provider: 'unknown',
      host: 'unparseable',
      port: 5432,
      database: 'unknown',
      isPooled: false,
      isNeon: false,
      sslMode: null,
      hasConnectTimeout: false,
      hasPgBouncer: false
    };
  }
};

/**
 * Inspects a database connection URL and safely injects resilience parameters required
 * for serverless PostgreSQL providers (specifically Neon):
 * 1. sslmode=require (required by Neon)
 * 2. connect_timeout=30 (prevents Prisma P1001 timeouts during Neon compute cold-starts / wakeups)
 * 3. pool_timeout=30 (ensures pool acquisition waits for serverless wake)
 * 4. pgbouncer=true (for -pooler endpoints to ensure Prisma handles transaction-mode PgBouncer correctly)
 */
export const sanitizeAndEnhanceDbUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname;
    const isNeon = hostname.endsWith('neon.tech') || hostname.includes('.neon.tech');
    const isPooler = hostname.includes('-pooler');

    if (isNeon) {
      // 1. SSL is mandatory on Neon
      if (!parsed.searchParams.has('sslmode')) {
        parsed.searchParams.set('sslmode', 'require');
      }

      // 2. Neon serverless computes auto-suspend when idle. Give compute 30s to resume.
      const currentConnectTimeout = parseInt(parsed.searchParams.get('connect_timeout') || '0', 10);
      if (!currentConnectTimeout || currentConnectTimeout < 30) {
        parsed.searchParams.set('connect_timeout', '30');
      }

      // 3. Pool timeout of at least 30s
      const currentPoolTimeout = parseInt(parsed.searchParams.get('pool_timeout') || '0', 10);
      if (!currentPoolTimeout || currentPoolTimeout < 30) {
        parsed.searchParams.set('pool_timeout', '30');
      }

      // 4. PgBouncer mode for pooled endpoints
      if (isPooler && !parsed.searchParams.has('pgbouncer')) {
        parsed.searchParams.set('pgbouncer', 'true');
      }
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

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
