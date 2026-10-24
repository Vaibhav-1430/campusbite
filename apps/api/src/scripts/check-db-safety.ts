import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assertSafeTestDatabase,
  assertSafeDevelopmentDatabase,
  findMonorepoRoot
} from '../database/safety-guard.js';
import { getSanitizedConnectionInfo, DatabaseConnectionInfo } from '../database/connection-url.js';

const repoRoot = findMonorepoRoot(process.cwd());

export interface DiagnosticOptions {
  env?: string;
  databaseUrl?: string;
  exitProcess?: boolean;
}

export interface DiagnosticResult {
  success: boolean;
  gate: 'TEST' | 'PRODUCTION' | 'DEVELOPMENT';
  exitCode: number;
  message: string;
  error?: string;
  connInfo?: DatabaseConnectionInfo;
}

/**
 * Loads the appropriate environment files for the diagnostic run.
 */
export function loadEnvForDiagnostic(repoRootPath = repoRoot, envName = process.env.NODE_ENV): void {
  const currentEnv = envName || 'development';
  if (currentEnv === 'test') {
    dotenv.config({ path: path.resolve(repoRootPath, 'apps/api/.env.test.local') });
    dotenv.config({ path: path.resolve(repoRootPath, '.env.test.local') });
    dotenv.config({ path: path.resolve(repoRootPath, 'apps/api/.env.test') });
    dotenv.config({ path: path.resolve(repoRootPath, '.env.test') });
  } else {
    dotenv.config({ path: path.resolve(repoRootPath, 'apps/api/.env.local') });
    dotenv.config({ path: path.resolve(repoRootPath, '.env.local') });
    dotenv.config({ path: path.resolve(repoRootPath, 'apps/api/.env') });
    dotenv.config({ path: path.resolve(repoRootPath, '.env') });
  }
}

/**
 * Diagnostic script that inspects DATABASE_URL and outputs sanitized target metadata,
 * safety status, and environment compliance without exposing secrets, passwords, or query tokens.
 */
export function runDiagnostic(options: DiagnosticOptions = {}): DiagnosticResult {
  const exitProcess = options.exitProcess !== false;
  const currentEnv = options.env || process.env.NODE_ENV || 'development';
  const rawUrl = options.databaseUrl !== undefined ? options.databaseUrl : process.env.DATABASE_URL;

  console.log('================================================================');
  console.log('        CampusBite Database Target Safety Diagnostic            ');
  console.log('================================================================');
  console.log(`Active Environment (NODE_ENV) : ${currentEnv}`);

  if (!rawUrl || !rawUrl.trim()) {
    console.error('DATABASE_URL Status          : NOT CONFIGURED (Empty)');
    console.error('Safety Check                 : FAILED (Database URL required)');
    if (exitProcess) process.exit(1);
    return {
      success: false,
      gate: currentEnv === 'production' ? 'PRODUCTION' : currentEnv === 'test' ? 'TEST' : 'DEVELOPMENT',
      exitCode: 1,
      message: 'FAILED (Database URL required)',
      error: 'DATABASE_URL is absent or empty'
    };
  }

  let connInfo: DatabaseConnectionInfo;
  try {
    connInfo = getSanitizedConnectionInfo(rawUrl);
  } catch (err: any) {
    console.error(`[FAILED] MALFORMED DATABASE URL     : FAILED - ${err.message}`);
    if (exitProcess) process.exit(1);
    return {
      success: false,
      gate: currentEnv === 'production' ? 'PRODUCTION' : currentEnv === 'test' ? 'TEST' : 'DEVELOPMENT',
      exitCode: 1,
      message: 'FAILED (Malformed database URL)',
      error: err.message
    };
  }

  // Redact sensitive host substrings if cloud-hosted
  const displayHost = connInfo.isNeon
    ? `${connInfo.host.substring(0, 6)}***.neon.tech`
    : connInfo.host;

  console.log(`Database Provider            : ${connInfo.provider}`);
  console.log(`Target Host Identifier       : ${displayHost}`);
  console.log(`Target Port                  : ${connInfo.port}`);
  console.log(`Target Database Name         : ${connInfo.database}`);
  console.log(`Cloud / Neon Detected        : ${connInfo.isNeon}`);
  console.log(`Connection Pooling (PgBouncer): ${connInfo.isPooled}`);
  console.log(`SSL Mode Enforced            : ${connInfo.sslMode || 'none'}`);
  console.log('----------------------------------------------------------------');

  if (currentEnv === 'test') {
    console.log('Validating against Test Safety Policies:');
    try {
      assertSafeTestDatabase(rawUrl, 'Safety Diagnostic CLI');
      console.log('[PASSED] TEST SAFETY GATE           : PASSED (Approved isolated test target)');
      if (exitProcess) process.exit(0);
      return {
        success: true,
        gate: 'TEST',
        exitCode: 0,
        message: 'PASSED (Approved isolated test target)',
        connInfo
      };
    } catch (err: any) {
      console.error(`[FAILED] TEST SAFETY GATE           : FAILED - ${err.message}`);
      if (exitProcess) process.exit(1);
      return {
        success: false,
        gate: 'TEST',
        exitCode: 1,
        message: 'FAILED',
        error: err.message,
        connInfo
      };
    }
  } else if (currentEnv === 'production') {
    console.log('Validating against Production Safety Policies:');
    const isLocal = connInfo.host === 'localhost' || connInfo.host === '127.0.0.1';
    if (isLocal) {
      console.error('[FAILED] PRODUCTION SAFETY GATE     : FAILED (Production cannot target localhost)');
      if (exitProcess) process.exit(1);
      return {
        success: false,
        gate: 'PRODUCTION',
        exitCode: 1,
        message: 'FAILED (Production cannot target localhost)',
        error: 'Production cannot target localhost',
        connInfo
      };
    }
    if (!connInfo.sslMode || connInfo.sslMode === 'disable') {
      console.error('[FAILED] PRODUCTION SAFETY GATE     : FAILED (Production requires SSL mode)');
      if (exitProcess) process.exit(1);
      return {
        success: false,
        gate: 'PRODUCTION',
        exitCode: 1,
        message: 'FAILED (Production requires SSL mode)',
        error: 'Production requires SSL mode',
        connInfo
      };
    }
    console.log('[PASSED] PRODUCTION SAFETY GATE     : PASSED (Target matches production criteria)');
    if (exitProcess) process.exit(0);
    return {
      success: true,
      gate: 'PRODUCTION',
      exitCode: 0,
      message: 'PASSED (Target matches production criteria)',
      connInfo
    };
  } else {
    // Development mode
    console.log('Validating Development Target:');
    try {
      assertSafeDevelopmentDatabase(rawUrl, 'Safety Diagnostic CLI');
      console.log('[INFO] Target                       : Local development database.');
      console.log('[PASSED] DEVELOPMENT SAFETY GATE    : PASSED for development use.');
      if (exitProcess) process.exit(0);
      return {
        success: true,
        gate: 'DEVELOPMENT',
        exitCode: 0,
        message: 'PASSED for development use.',
        connInfo
      };
    } catch (err: any) {
      console.error(`[FAILED] DEVELOPMENT SAFETY GATE    : FAILED - ${err.message}`);
      if (exitProcess) process.exit(1);
      return {
        success: false,
        gate: 'DEVELOPMENT',
        exitCode: 1,
        message: 'FAILED',
        error: err.message,
        connInfo
      };
    }
  }
}

// Check if executed directly via CLI
const isDirectExecution = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('check-db-safety.ts') ||
   process.argv[1].endsWith('check-db-safety.js') ||
   (import.meta.url && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)))
);

if (isDirectExecution) {
  loadEnvForDiagnostic();
  runDiagnostic();
}
