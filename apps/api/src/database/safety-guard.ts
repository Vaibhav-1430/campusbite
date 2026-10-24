import { DatabaseConnectionInfo, getSanitizedConnectionInfo } from './connection-url.js';

export class DatabaseSafetyError extends Error {
  public readonly code = 'DATABASE_SAFETY_VIOLATION';
  public readonly targetHost?: string;
  public readonly targetDatabase?: string;

  constructor(message: string, details?: { host?: string; database?: string }) {
    super(message);
    this.name = 'DatabaseSafetyError';
    this.targetHost = details?.host;
    this.targetDatabase = details?.database;
  }
}

/**
 * Unique symbol capability token required for executing destructive test cleanup.
 * Production application code cannot obtain this symbol accidentally.
 */
export const TEST_CLEANUP_CAPABILITY: unique symbol = Symbol('CAMPUSBITE_TEST_CLEANUP_CAPABILITY');

/**
 * Explicit list of prohibited cloud / production database host suffixes and keywords.
 * Connecting to any of these during test execution or local seed/reset is strictly blocked.
 */
export const PROHIBITED_PRODUCTION_HOST_PATTERNS = [
  'neon.tech',
  '.neon.tech',
  'aws.neon.tech',
  'render.com',
  'onrender.com',
  'rds.amazonaws.com',
  'supabase.co',
  'supabase.net',
  'azure.com',
  'cloudsql.google.com',
  'railway.app',
  'railway.internal',
  'elephantsql.com',
  'cockroachlabs.cloud',
  'aivencloud.com'
];

/**
 * Explicit default allowlist of permitted hosts for test databases.
 * Tests must run strictly against isolated local or CI container databases.
 */
const DEFAULT_APPROVED_TEST_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'];

/**
 * Returns the effective approved test hosts allowlist, supporting explicit environment variable overrides
 * (e.g. APPROVED_TEST_DATABASE_HOSTS) while rigorously forbidding any production domains.
 */
export function getApprovedTestHosts(): string[] {
  const envHosts = process.env.APPROVED_TEST_DATABASE_HOSTS
    ? process.env.APPROVED_TEST_DATABASE_HOSTS.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
    : [];

  const combined = Array.from(new Set([...DEFAULT_APPROVED_TEST_HOSTS, ...envHosts]));

  // Ensure no prohibited host pattern accidentally enters the allowlist
  return combined.filter((host) => {
    const normalized = host.replace(/^\[|\]$/g, '');
    return !PROHIBITED_PRODUCTION_HOST_PATTERNS.some((prohibited) =>
      normalized === prohibited || normalized.endsWith(`.${prohibited}`) || normalized.includes(prohibited)
    );
  });
}

/**
 * Checks whether a database host is a known production or cloud-hosted database provider.
 */
export function isProhibitedProductionHost(host: string): boolean {
  if (!host || typeof host !== 'string') return false;
  const normalized = host.trim().toLowerCase();
  return PROHIBITED_PRODUCTION_HOST_PATTERNS.some((pattern) =>
    normalized === pattern || normalized.endsWith(`.${pattern}`) || normalized.includes(pattern)
  );
}

/**
 * Checks whether a database name clearly designates a dedicated isolated test database.
 * Substring matches are NOT accepted; the database name must explicitly end with _test or _ci,
 * or be exactly "test".
 */
export function isApprovedTestDatabaseName(dbName: string): boolean {
  if (!dbName || typeof dbName !== 'string') return false;
  const normalized = dbName.trim().toLowerCase();

  // Explicitly prohibited non-test database names
  const prohibitedExact = [
    'campusbite',
    'campusbite_dev',
    'campusbite_development',
    'campusbite_staging',
    'campusbite_prod',
    'campusbite_production',
    'production',
    'prod',
    'staging',
    'postgres',
    'template1'
  ];

  if (prohibitedExact.includes(normalized)) {
    return false;
  }

  // Must strictly end with _test or _ci, or equal "test"
  return /(_test|_ci)$/i.test(normalized) || normalized === 'test';
}

export interface DatabaseSafetyReport {
  isSafeForTests: boolean;
  isProductionHost: boolean;
  provider: string;
  host: string;
  port: number;
  database: string;
  issues: string[];
}

/**
 * Inspects a database URL and generates a sanitized safety report without logging credentials.
 */
export function getDatabaseSafetyReport(rawUrl?: string, nodeEnv?: string): DatabaseSafetyReport {
  const envName = (nodeEnv || process.env.NODE_ENV || 'unknown').toLowerCase();
  const issues: string[] = [];

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    issues.push('Database URL is missing or empty.');
    return {
      isSafeForTests: false,
      isProductionHost: false,
      provider: 'none',
      host: 'none',
      port: 0,
      database: 'none',
      issues
    };
  }

  let info: DatabaseConnectionInfo;
  try {
    info = getSanitizedConnectionInfo(rawUrl);
  } catch {
    issues.push('Database URL is malformed and could not be parsed.');
    return {
      isSafeForTests: false,
      isProductionHost: false,
      provider: 'unknown',
      host: 'unparseable',
      port: 0,
      database: 'unparseable',
      issues
    };
  }

  const isProdHost = isProhibitedProductionHost(info.host) || info.isNeon;
  if (isProdHost) {
    issues.push(`Host "${info.host}" is a prohibited cloud/production provider (Neon/AWS/Render/Cloud).`);
  }

  const approvedHosts = getApprovedTestHosts();
  const normalizedHost = info.host.toLowerCase().replace(/^\[|\]$/g, '');
  const isApprovedHost = approvedHosts.some((h) => h.replace(/^\[|\]$/g, '') === normalizedHost);
  if (!isApprovedHost) {
    issues.push(`Host "${info.host}" is not in the approved test database allowlist: [${approvedHosts.join(', ')}].`);
  }

  const isApprovedDb = isApprovedTestDatabaseName(info.database);
  if (!isApprovedDb) {
    issues.push(
      `Database "${info.database}" is not an approved test database. Name must strictly end with "_test" or "_ci" (e.g. campusbite_test).`
    );
  }

  if (envName !== 'test') {
    issues.push(`NODE_ENV is "${envName}". Test operations strictly require NODE_ENV="test".`);
  }

  const isSafeForTests = issues.length === 0;

  return {
    isSafeForTests,
    isProductionHost: isProdHost,
    provider: info.provider,
    host: info.host,
    port: info.port,
    database: info.database,
    issues
  };
}

/**
 * Fail-closed assertion: Throws an immediate DatabaseSafetyError if the database configuration
 * does not meet all criteria for an isolated, dedicated test database.
 *
 * Rules:
 * 1. NODE_ENV must be strictly 'test'.
 * 2. DATABASE_URL must be present and valid postgresql URL.
 * 3. Database host must NOT match any production / Neon / cloud database pattern.
 * 4. Database host MUST be in the approved test host allowlist (localhost, 127.0.0.1, postgres).
 * 5. Database name must strictly end with _test or _ci (e.g. campusbite_test).
 */
export function assertSafeTestDatabase(rawUrl?: string, context = 'Database Operation'): DatabaseConnectionInfo {
  const currentEnv = process.env.NODE_ENV;

  if (currentEnv !== 'test') {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Refusing to perform test database operation in context "${context}". NODE_ENV must be strictly "test", but is currently "${currentEnv}".`,
      { host: 'unknown', database: 'unknown' }
    );
  }

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Database URL is absent or empty in context "${context}". Refusing to run tests without an explicit isolated test database.`,
      { host: 'none', database: 'none' }
    );
  }

  let info: DatabaseConnectionInfo;
  try {
    info = getSanitizedConnectionInfo(rawUrl);
  } catch (err: any) {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Database URL is malformed in context "${context}": ${err?.message || String(err)}`,
      { host: 'unparseable', database: 'unparseable' }
    );
  }

  if (info.provider !== 'postgresql' && info.provider !== 'postgres') {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Database provider "${info.provider}" is invalid. Expected "postgresql" or "postgres". Context: "${context}".`,
      { host: info.host, database: info.database }
    );
  }

  // 1. Check for prohibited production hosts
  if (isProhibitedProductionHost(info.host) || info.isNeon) {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Prohibited cloud/production database host "${info.host}" detected in test context "${context}"! Execution aborted immediately to protect production data.`,
      { host: info.host, database: info.database }
    );
  }

  // 2. Check against approved test hosts allowlist
  const approvedHosts = getApprovedTestHosts();
  const normalizedHost = info.host.toLowerCase().replace(/^\[|\]$/g, '');
  const isApprovedHost = approvedHosts.some((h) => h.replace(/^\[|\]$/g, '') === normalizedHost);
  if (!isApprovedHost) {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Host "${info.host}" is not an approved test database host in context "${context}". Approved test hosts: [${approvedHosts.join(', ')}].`,
      { host: info.host, database: info.database }
    );
  }

  // 3. Check database name
  if (!isApprovedTestDatabaseName(info.database)) {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Target database "${info.database}" is not an approved test database in context "${context}". Test database name must strictly end with "_test" or "_ci" (e.g. campusbite_test, campusbite_ci).`,
      { host: info.host, database: info.database }
    );
  }

  return info;
}

/**
 * Asserts that a destructive test cleanup operation has the required capability token AND
 * is connected to a verified safe test database.
 */
export function assertTestCleanupCapability(
  capability: unknown,
  rawUrl?: string,
  context = 'cleanDatabase()'
): void {
  if (capability !== TEST_CLEANUP_CAPABILITY) {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Destructive cleanup "${context}" invoked without valid TEST_CLEANUP_CAPABILITY token! Application and production code are strictly forbidden from performing bulk database wipes.`
    );
  }

  assertSafeTestDatabase(rawUrl || process.env.DATABASE_URL, context);
}
