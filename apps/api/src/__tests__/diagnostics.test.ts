import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  getSanitizedConnectionInfo,
  sanitizeAndEnhanceDbUrl,
  runDatabaseStartupDiagnostics
} from '../database/diagnostics.js';
import { runDiagnostic } from '../scripts/check-db-safety.js';

describe('Database Diagnostics & Connection Normalization', () => {
  const sampleNeonPoolerUrl =
    'postgresql://neondb_owner:npg_SecretPass123!@ep-shy-rain-azmt3i55-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb';

  it('should strip credentials completely in sanitized connection metadata', () => {
    const info = getSanitizedConnectionInfo(sampleNeonPoolerUrl);

    expect(info.host).toBe('ep-shy-rain-azmt3i55-pooler.c-3.ap-southeast-1.aws.neon.tech');
    expect(info.port).toBe(5432);
    expect(info.database).toBe('neondb');
    expect(info.isNeon).toBe(true);
    expect(info.isPooled).toBe(true);

    // Verify secrets are nowhere in the output object
    const serialized = JSON.stringify(info);
    expect(serialized).not.toContain('npg_SecretPass123!');
    expect(serialized).not.toContain('neondb_owner');
    expect((info as any).password).toBeUndefined();
    expect((info as any).user).toBeUndefined();
  });

  it('should safely enhance Neon pooler URLs with sslmode, connect_timeout, pool_timeout, and pgbouncer', () => {
    const enhanced = sanitizeAndEnhanceDbUrl(sampleNeonPoolerUrl);
    const parsed = new URL(enhanced);

    expect(parsed.searchParams.get('sslmode')).toBe('require');
    expect(parsed.searchParams.get('connect_timeout')).toBe('30');
    expect(parsed.searchParams.get('pool_timeout')).toBe('30');
    expect(parsed.searchParams.get('pgbouncer')).toBe('true');

    // Credentials must be retained in the connection string
    expect(parsed.username).toBe('neondb_owner');
  });

  it('should preserve higher custom connect_timeout if already provided', () => {
    const urlWithLongerTimeout = `${sampleNeonPoolerUrl}?connect_timeout=60&sslmode=verify-full`;
    const enhanced = sanitizeAndEnhanceDbUrl(urlWithLongerTimeout);
    const parsed = new URL(enhanced);

    expect(parsed.searchParams.get('connect_timeout')).toBe('60');
    expect(parsed.searchParams.get('sslmode')).toBe('verify-full');
  });

  it('should not mutate local development or test postgres connection URLs', () => {
    const localUrl = 'postgresql://postgres@localhost:5432/campusbite_dev';
    const enhanced = sanitizeAndEnhanceDbUrl(localUrl);

    expect(enhanced).toBe(localUrl);
  });

  it('should successfully run startup diagnostics against the active database', async () => {
    const result = await runDatabaseStartupDiagnostics(process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/campusbite_dev');

    expect(result.connected).toBe(true);
    expect(result.latencyMs).toBeDefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should accurately report healthy database connectivity on /health and /api/v1/health', async () => {
    const app = createApp();

    const rootRes = await request(app).get('/health');
    expect(rootRes.status).toBe(200);
    expect(rootRes.body.success).toBe(true);
    expect(rootRes.body.data.status).toBe('healthy');
    expect(rootRes.body.data.database).toBe('connected');
    expect(rootRes.body.data.latencyMs).toBeDefined();

    const apiRes = await request(app).get('/api/v1/health');
    expect(apiRes.status).toBe(200);
    expect(apiRes.body.success).toBe(true);
    expect(apiRes.body.data.database).toBe('connected');
  });
});

describe('Database Safety Diagnostic CLI & Evaluation Gate (check-db-safety)', () => {
  const localDevUrl = 'postgresql://postgres:pass@localhost:5432/campusbite_dev';
  const localTestUrl = 'postgresql://postgres:pass@localhost:5432/campusbite_test';
  const neonProdUrl = 'postgresql://campusbite_app:npg_pass123@ep-shy-rain-azmt3i55-pooler.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require&pgbouncer=true';
  const localProdUrl = 'postgresql://campusbite_app:pass@localhost:5432/campusbite?sslmode=require';
  const unencryptedProdUrl = 'postgresql://campusbite_app:pass@ep-shy-rain-azmt3i55-pooler.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=disable';

  it('passes development safety gate when targeting approved local development database', () => {
    const result = runDiagnostic({
      env: 'development',
      databaseUrl: localDevUrl,
      exitProcess: false
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.gate).toBe('DEVELOPMENT');
    expect(result.message).toContain('PASSED for development use');
    expect(result.error).toBeUndefined();
  });

  it('fails closed with exitCode 1 in development mode when targeting a Neon cloud database', () => {
    const result = runDiagnostic({
      env: 'development',
      databaseUrl: neonProdUrl,
      exitProcess: false
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.gate).toBe('DEVELOPMENT');
    expect(result.error).toMatch(/Refusing to perform Safety Diagnostic CLI against cloud\/production database/);
  });

  it('fails closed in development mode when targeting a production database name on localhost', () => {
    const result = runDiagnostic({
      env: 'development',
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/campusbite',
      exitProcess: false
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.gate).toBe('DEVELOPMENT');
    expect(result.error).toMatch(/is a production database name/);
  });

  it('passes test safety gate when targeting an approved isolated test database', () => {
    const result = runDiagnostic({
      env: 'test',
      databaseUrl: localTestUrl,
      exitProcess: false
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.gate).toBe('TEST');
    expect(result.message).toContain('Approved isolated test target');
  });

  it('fails closed in test mode when targeting Neon production database', () => {
    const result = runDiagnostic({
      env: 'test',
      databaseUrl: neonProdUrl,
      exitProcess: false
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.gate).toBe('TEST');
    expect(result.error).toMatch(/Prohibited cloud\/production/);
  });

  it('passes production safety gate when targeting valid non-local host with SSL enabled', () => {
    const result = runDiagnostic({
      env: 'production',
      databaseUrl: neonProdUrl,
      exitProcess: false
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.gate).toBe('PRODUCTION');
    expect(result.message).toContain('Target matches production criteria');
  });

  it('fails production safety gate when targeting localhost', () => {
    const result = runDiagnostic({
      env: 'production',
      databaseUrl: localProdUrl,
      exitProcess: false
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.gate).toBe('PRODUCTION');
    expect(result.error).toContain('Production cannot target localhost');
  });

  it('fails production safety gate when SSL mode is disabled', () => {
    const result = runDiagnostic({
      env: 'production',
      databaseUrl: unencryptedProdUrl,
      exitProcess: false
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.gate).toBe('PRODUCTION');
    expect(result.error).toContain('Production requires SSL mode');
  });

  it('fails safely when database URL is absent or empty', () => {
    const result = runDiagnostic({
      env: 'development',
      databaseUrl: '',
      exitProcess: false
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('DATABASE_URL is absent or empty');
  });
});
