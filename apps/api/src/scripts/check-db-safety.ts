import dotenv from 'dotenv';
import path from 'path';
import { getDatabaseSafetyReport, assertSafeTestDatabase } from '../database/safety-guard.js';
import { getSanitizedConnectionInfo } from '../database/connection-url.js';

// Preload appropriate environment configuration
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.test.local') });
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.test') });
} else {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });
}

/**
 * Diagnostic CLI script that inspects DATABASE_URL and outputs sanitized target metadata,
 * safety status, and environment compliance without exposing secrets, passwords, or query tokens.
 */
function runDiagnostic(): void {
  const currentEnv = process.env.NODE_ENV || 'development';
  const rawUrl = process.env.DATABASE_URL;

  console.log('================================================================');
  console.log('        CampusBite Database Target Safety Diagnostic            ');
  console.log('================================================================');
  console.log(`Active Environment (NODE_ENV) : ${currentEnv}`);

  if (!rawUrl) {
    console.error('DATABASE_URL Status          : NOT CONFIGURED (Empty)');
    console.error('Safety Check                 : FAILED (Database URL required)');
    process.exit(1);
  }

  const report = getDatabaseSafetyReport(rawUrl, currentEnv);
  const connInfo = getSanitizedConnectionInfo(rawUrl);

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
      console.log('✅ TEST SAFETY GATE           : PASSED (Approved isolated test target)');
      process.exit(0);
    } catch (err: any) {
      console.error(`❌ TEST SAFETY GATE           : FAILED - ${err.message}`);
      process.exit(1);
    }
  } else if (currentEnv === 'production') {
    console.log('Validating against Production Safety Policies:');
    const isLocal = connInfo.host === 'localhost' || connInfo.host === '127.0.0.1';
    if (isLocal) {
      console.error('❌ PRODUCTION SAFETY GATE     : FAILED (Production cannot target localhost)');
      process.exit(1);
    }
    if (!connInfo.sslMode || connInfo.sslMode === 'disable') {
      console.error('❌ PRODUCTION SAFETY GATE     : FAILED (Production requires SSL mode)');
      process.exit(1);
    }
    console.log('✅ PRODUCTION SAFETY GATE     : PASSED (Target matches production criteria)');
    process.exit(0);
  } else {
    // Development mode
    console.log('Validating Development Target:');
    if (connInfo.isNeon) {
      console.log('⚠️  NOTICE                      : Target is a Neon Cloud Database.');
    } else {
      console.log('ℹ️  Target                     : Local development database.');
    }
    console.log('✅ SAFETY AUDIT               : PASSED for development use.');
    process.exit(0);
  }
}

runDiagnostic();
