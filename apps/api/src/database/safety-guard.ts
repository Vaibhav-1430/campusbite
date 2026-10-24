import fs from 'fs';
import path from 'path';
import { DatabaseConnectionInfo, getSanitizedConnectionInfo } from './connection-url.js';

/**
 * Locates the monorepo root directory containing the root package.json with workspaces.
 * Works seamlessly whether executed from repo root, apps/api workspace, or nested directories.
 */
export function findMonorepoRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);
  while (true) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          return current;
        }
      } catch {
        // continue searching upwards
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

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

/**
 * Asserts that a database target is an approved, isolated local development database.
 * Rejects any cloud, Neon, production host, or production database name.
 */
export function assertSafeDevelopmentDatabase(
  rawUrl?: string,
  context = 'Development Database Operation'
): DatabaseConnectionInfo {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Database URL is absent or empty in context "${context}".`,
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

  // 1. Forbid cloud / production hosts
  if (isProhibitedProductionHost(info.host) || info.isNeon) {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Refusing to perform ${context} against cloud/production database "${info.host}". Development operations are strictly restricted to local database targets.`,
      { host: info.host, database: info.database }
    );
  }

  // 2. Must be a local host
  const normalizedHost = info.host.toLowerCase().replace(/^\[|\]$/g, '');
  const localHosts = ['localhost', '127.0.0.1', '::1'];
  if (!localHosts.includes(normalizedHost)) {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Host "${info.host}" is not an approved local development host in context "${context}". Allowed: [${localHosts.join(', ')}].`,
      { host: info.host, database: info.database }
    );
  }

  // 3. Forbid production database names
  const normalizedDb = info.database.toLowerCase();
  if (normalizedDb === 'campusbite' || normalizedDb === 'production' || normalizedDb === 'prod') {
    throw new DatabaseSafetyError(
      `CRITICAL SAFETY VIOLATION: Target database "${info.database}" is a production database name. Development commands cannot target production databases.`,
      { host: info.host, database: info.database }
    );
  }

  return info;
}

/**
 * Asserts that NODE_ENV is permissible for running local development migrations (prisma migrate dev).
 * Strictly rejects 'production', 'prod', 'test', 'staging', 'ci', and any non-development environment.
 */
export function assertSafeMigrateDevEnvironment(nodeEnv?: string): string {
  const raw = (nodeEnv || '').trim().toLowerCase();
  if (raw === 'production' || raw === 'prod') {
    throw new DatabaseSafetyError(
      'Cannot execute development migrations (prisma migrate dev) in a production environment (NODE_ENV="production"). For production deployments, use "npm run db:deploy".'
    );
  }
  if (raw && raw !== 'development' && raw !== 'dev') {
    throw new DatabaseSafetyError(
      `Cannot execute development migrations in environment NODE_ENV="${nodeEnv}". Development migrations are strictly permitted only in "development" mode.`
    );
  }
  return raw || 'development';
}

/**
 * Validates that production migrations use dedicated migration credentials and a direct unpooled endpoint.
 */
export function assertSafeProductionMigration(
  migrationUrl?: string,
  context = 'Production Migration'
): DatabaseConnectionInfo {
  if (!migrationUrl || typeof migrationUrl !== 'string' || !migrationUrl.trim()) {
    throw new DatabaseSafetyError(
      `CRITICAL DEPLOYMENT VIOLATION: In production, migrations require dedicated migration credentials. Neither MIGRATION_DATABASE_URL nor DIRECT_URL is configured. Context: "${context}".`,
      { host: 'none', database: 'none' }
    );
  }

  let info: DatabaseConnectionInfo;
  let parsedUrl: URL;
  try {
    info = getSanitizedConnectionInfo(migrationUrl);
    parsedUrl = new URL(migrationUrl);
  } catch (err: any) {
    throw new DatabaseSafetyError(
      `CRITICAL DEPLOYMENT VIOLATION: Migration database URL is malformed in context "${context}": ${err?.message || String(err)}`,
      { host: 'unparseable', database: 'unparseable' }
    );
  }

  if (info.provider !== 'postgresql' && info.provider !== 'postgres') {
    throw new DatabaseSafetyError(
      `CRITICAL DEPLOYMENT VIOLATION: Database provider "${info.provider}" is invalid. Expected "postgresql" or "postgres". Context: "${context}".`,
      { host: info.host, database: info.database }
    );
  }

  // 1. Direct unpooled endpoint required in production
  if (info.isPooled || parsedUrl.searchParams.get('pgbouncer') === 'true') {
    throw new DatabaseSafetyError(
      `CRITICAL DEPLOYMENT VIOLATION: Production migrations cannot be executed against a pooled (-pooler) PgBouncer endpoint. In serverless PostgreSQL (Neon), pooled endpoints do not support migration advisory locks. You must configure MIGRATION_DATABASE_URL using the direct compute endpoint. Context: "${context}".`,
      { host: info.host, database: info.database }
    );
  }

  // 2. Dedicated campusbite_migrator role required
  const username = decodeURIComponent(parsedUrl.username || '');
  if (username === 'campusbite_app') {
    throw new DatabaseSafetyError(
      `CRITICAL DEPLOYMENT VIOLATION: Attempted to run migrations with runtime application user "campusbite_app". This user is restricted to least-privilege DML operations and will be rejected by PostgreSQL DDL. Configure MIGRATION_DATABASE_URL with "campusbite_migrator". Context: "${context}".`,
      { host: info.host, database: info.database }
    );
  }

  if (username !== 'campusbite_migrator') {
    throw new DatabaseSafetyError(
      `CRITICAL DEPLOYMENT VIOLATION: Production migrations require the dedicated "campusbite_migrator" role. Attempted to run with role "${username || 'unspecified'}". Context: "${context}".`,
      { host: info.host, database: info.database }
    );
  }

  return info;
}

export interface ResolvedMigrationTarget {
  migrationUrl: string;
  sourceVariable: 'MIGRATION_DATABASE_URL' | 'DIRECT_URL' | 'DATABASE_URL';
  targetInfo: DatabaseConnectionInfo;
  nodeEnv: string;
}

/**
 * Resolves and strictly validates the database connection URL for running Prisma migrations.
 * Guarantees that:
 * 1. Development mode NEVER falls back to or touches a production or Neon endpoint.
 * 2. Production migrations require an explicit MIGRATION_DATABASE_URL or DIRECT_URL with campusbite_migrator.
 * 3. Test mode targets only approved isolated test databases.
 */
export function resolveAndValidateMigrationUrl(options?: {
  nodeEnv?: string;
  envVars?: Record<string, string | undefined>;
}): ResolvedMigrationTarget {
  const env = options?.envVars || process.env;
  const nodeEnv = (options?.nodeEnv || env.NODE_ENV || 'development').toLowerCase();

  const migrationUrlExplicit = env.MIGRATION_DATABASE_URL;
  const directUrlExplicit = env.DIRECT_URL;
  const databaseUrl = env.DATABASE_URL;

  let resolvedUrl: string | undefined;
  let sourceVariable: 'MIGRATION_DATABASE_URL' | 'DIRECT_URL' | 'DATABASE_URL';

  if (migrationUrlExplicit && migrationUrlExplicit.trim()) {
    resolvedUrl = migrationUrlExplicit.trim();
    sourceVariable = 'MIGRATION_DATABASE_URL';
  } else if (directUrlExplicit && directUrlExplicit.trim()) {
    resolvedUrl = directUrlExplicit.trim();
    sourceVariable = 'DIRECT_URL';
  } else {
    // No explicit migration URL provided
    if (nodeEnv === 'production') {
      throw new DatabaseSafetyError(
        'CRITICAL DEPLOYMENT ERROR: In production, migrations require dedicated migration credentials. Neither MIGRATION_DATABASE_URL nor DIRECT_URL is configured. The runtime role "campusbite_app" has restricted DML-only privileges and cannot perform DDL migrations.'
      );
    }

    if (!databaseUrl || !databaseUrl.trim()) {
      throw new DatabaseSafetyError(
        'CRITICAL DEPLOYMENT ERROR: No database connection URL found for migrations. DATABASE_URL is not set.'
      );
    }

    resolvedUrl = databaseUrl.trim();
    sourceVariable = 'DATABASE_URL';
  }

  const info = getSanitizedConnectionInfo(resolvedUrl);

  // Policy Enforcement based on environment and target
  if (nodeEnv === 'production') {
    assertSafeProductionMigration(resolvedUrl, 'resolveAndValidateMigrationUrl (production)');
  } else if (nodeEnv === 'test') {
    assertSafeTestDatabase(resolvedUrl, 'resolveAndValidateMigrationUrl (test)');
  } else {
    // Development mode:
    // If the resolved target is Neon or any prohibited cloud host, FAIL CLOSED immediately!
    // A development migration command must NEVER run against production or cloud.
    if (isProhibitedProductionHost(info.host) || info.isNeon) {
      throw new DatabaseSafetyError(
        `CRITICAL SAFETY VIOLATION: Migration command running in development mode resolved to a cloud/production database target ("${info.host}/${info.database}"). Refusing to execute migrations. Development migrations are strictly restricted to local database targets (e.g. localhost:5432/campusbite_dev). Never point local development migrations at production.`
      );
    }

    assertSafeDevelopmentDatabase(resolvedUrl, 'resolveAndValidateMigrationUrl (development)');
  }

  return {
    migrationUrl: resolvedUrl,
    sourceVariable,
    targetInfo: info,
    nodeEnv
  };
}
