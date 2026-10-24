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
