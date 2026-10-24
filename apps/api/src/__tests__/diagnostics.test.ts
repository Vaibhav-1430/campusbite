import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  getSanitizedConnectionInfo,
  sanitizeAndEnhanceDbUrl,
  runDatabaseStartupDiagnostics
} from '../database/diagnostics.js';

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
