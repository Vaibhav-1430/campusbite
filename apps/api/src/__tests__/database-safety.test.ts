import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  assertSafeTestDatabase,
  assertTestCleanupCapability,
  TEST_CLEANUP_CAPABILITY,
  DatabaseSafetyError,
  isApprovedTestDatabaseName,
  isProhibitedProductionHost,
  getDatabaseSafetyReport
} from '../database/safety-guard.js';

describe('Database Safety Guard & Test Isolation Gates (P0)', () => {
  const PRODUCTION_NEON_DIRECT_URL =
    'postgresql://neondb_owner:npg_SECRET_PASS_12345@ep-shy-rain-azmt3i55.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require';
  const PRODUCTION_NEON_POOLED_URL =
    'postgresql://neondb_owner:npg_SECRET_PASS_12345@ep-shy-rain-azmt3i55-pooler.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require&pgbouncer=true';
  const VALID_LOCAL_TEST_URL =
    'postgresql://postgres:password@localhost:5432/campusbite_test?schema=public';
  const VALID_LOCAL_IPV4_TEST_URL =
    'postgresql://postgres:password@127.0.0.1:5432/campusbite_test?schema=public';
  const VALID_LOCAL_IPV6_TEST_URL =
    'postgresql://postgres:password@[::1]:5432/campusbite_test?schema=public';
  const VALID_CI_TEST_URL =
    'postgresql://postgres:password@postgres:5432/campusbite_ci?schema=public';

  describe('1. Production & Cloud Host Rejection (Direct & Pooled Neon)', () => {
    it('strictly rejects the actual production Neon database URL (direct compute)', () => {
      expect(() => {
        assertSafeTestDatabase(PRODUCTION_NEON_DIRECT_URL, 'Unit Test');
      }).toThrowError(DatabaseSafetyError);

      try {
        assertSafeTestDatabase(PRODUCTION_NEON_DIRECT_URL, 'Unit Test');
      } catch (err: any) {
        expect(err.message).toContain('Prohibited cloud/production database host');
        expect(err.message).toContain('neon.tech');
        expect(err.code).toBe('DATABASE_SAFETY_VIOLATION');
      }
    });

    it('strictly rejects the actual production Neon database URL (pooled PgBouncer)', () => {
      expect(() => {
        assertSafeTestDatabase(PRODUCTION_NEON_POOLED_URL, 'Unit Test');
      }).toThrowError(DatabaseSafetyError);

      try {
        assertSafeTestDatabase(PRODUCTION_NEON_POOLED_URL, 'Unit Test');
      } catch (err: any) {
        expect(err.message).toContain('Prohibited cloud/production database host');
        expect(err.message).toContain('neon.tech');
        expect(err.code).toBe('DATABASE_SAFETY_VIOLATION');
      }
    });

    it('rejects various cloud database providers even if database name has _test suffix', () => {
      const cloudUrls = [
        'postgresql://admin:secret@my-rds.c123.rds.amazonaws.com:5432/campusbite_test',
        'postgresql://user:pass@dpg-abc123-a.oregon-postgres.render.com:5432/campusbite_test',
        'postgresql://postgres:pass@db.xyz.supabase.co:5432/campusbite_test',
        'postgresql://postgres:pass@db.xyz.supabase.net:5432/campusbite_test',
        'postgresql://user:pass@roundhouse.railway.app:5432/campusbite_test',
        'postgresql://user:pass@postgres.railway.internal:5432/campusbite_test',
        'postgresql://user:pass@tiny.db.elephantsql.com:5432/campusbite_test',
        'postgresql://user:pass@free-tier.cockroachlabs.cloud:26257/campusbite_test',
        'postgresql://user:pass@pg-test.aivencloud.com:5432/campusbite_test'
      ];

      for (const url of cloudUrls) {
        expect(() => assertSafeTestDatabase(url)).toThrowError(/Prohibited cloud\/production/);
      }
    });

    it('correctly identifies prohibited production host patterns', () => {
      expect(isProhibitedProductionHost('ep-shy-rain-azmt3i55-pooler.c-3.ap-southeast-1.aws.neon.tech')).toBe(true);
      expect(isProhibitedProductionHost('ep-shy-rain-azmt3i55.c-3.ap-southeast-1.aws.neon.tech')).toBe(true);
      expect(isProhibitedProductionHost('neon.tech')).toBe(true);
      expect(isProhibitedProductionHost('dpg-123.render.com')).toBe(true);
      expect(isProhibitedProductionHost('onrender.com')).toBe(true);
      expect(isProhibitedProductionHost('railway.app')).toBe(true);
      expect(isProhibitedProductionHost('railway.internal')).toBe(true);
      expect(isProhibitedProductionHost('localhost')).toBe(false);
      expect(isProhibitedProductionHost('127.0.0.1')).toBe(false);
      expect(isProhibitedProductionHost('[::1]')).toBe(false);
      expect(isProhibitedProductionHost('::1')).toBe(false);
      expect(isProhibitedProductionHost('postgres')).toBe(false);
    });
  });

  describe('2. Test Database Name Policy Enforcement', () => {
    it('strictly rejects non-test database names even on localhost', () => {
      const devUrl = 'postgresql://postgres:password@localhost:5432/campusbite_dev';
      const prodNameOnLocal = 'postgresql://postgres:password@localhost:5432/campusbite';
      const defaultPostgres = 'postgresql://postgres:password@localhost:5432/postgres';

      expect(() => assertSafeTestDatabase(devUrl)).toThrowError(/not an approved test database/);
      expect(() => assertSafeTestDatabase(prodNameOnLocal)).toThrowError(/not an approved test database/);
      expect(() => assertSafeTestDatabase(defaultPostgres)).toThrowError(/not an approved test database/);
    });

    it('enforces naming patterns requiring _test or _ci suffix', () => {
      expect(isApprovedTestDatabaseName('campusbite_test')).toBe(true);
      expect(isApprovedTestDatabaseName('campusbite_ci')).toBe(true);
      expect(isApprovedTestDatabaseName('test')).toBe(true);
      expect(isApprovedTestDatabaseName('myapp_integration_test')).toBe(true);

      // Must reject standard production/dev names
      expect(isApprovedTestDatabaseName('campusbite')).toBe(false);
      expect(isApprovedTestDatabaseName('campusbite_dev')).toBe(false);
      expect(isApprovedTestDatabaseName('campusbite_development')).toBe(false);
      expect(isApprovedTestDatabaseName('campusbite_staging')).toBe(false);
      expect(isApprovedTestDatabaseName('campusbite_prod')).toBe(false);
      expect(isApprovedTestDatabaseName('production')).toBe(false);
      expect(isApprovedTestDatabaseName('')).toBe(false);
    });
  });

  describe('3. Network Host Allowlist & IP Address Edge Cases', () => {
    it('strictly rejects unapproved external IPv4 addresses', () => {
      const publicIp = 'postgresql://postgres:pass@54.210.12.34:5432/campusbite_test';
      const lanIp = 'postgresql://postgres:pass@192.168.1.100:5432/campusbite_test';

      expect(() => assertSafeTestDatabase(publicIp)).toThrowError(/not an approved test database host/);
      expect(() => assertSafeTestDatabase(lanIp)).toThrowError(/not an approved test database host/);
    });

    it('strictly rejects unapproved external IPv6 addresses', () => {
      const externalIpv6 = 'postgresql://postgres:pass@[2001:db8::1]:5432/campusbite_test';
      expect(() => assertSafeTestDatabase(externalIpv6)).toThrowError(/not an approved test database host/);
    });

    it('strictly rejects internal network host aliases or unapproved domain names', () => {
      const internalAlias = 'postgresql://postgres:pass@production-db.internal:5432/campusbite_test';
      const unapprovedDomain = 'postgresql://postgres:pass@db.campusbite.college:5432/campusbite_test';

      expect(() => assertSafeTestDatabase(internalAlias)).toThrowError(/not an approved test database host/);
      expect(() => assertSafeTestDatabase(unapprovedDomain)).toThrowError(/not an approved test database host/);
    });

    it('accepts loopback IPv4 and loopback IPv6 targets', () => {
      expect(assertSafeTestDatabase(VALID_LOCAL_TEST_URL).host).toBe('localhost');
      expect(assertSafeTestDatabase(VALID_LOCAL_IPV4_TEST_URL).host).toBe('127.0.0.1');
      expect(assertSafeTestDatabase(VALID_LOCAL_IPV6_TEST_URL).host).toBe('[::1]');
      expect(assertSafeTestDatabase(VALID_CI_TEST_URL).host).toBe('postgres');
    });
  });

  describe('4. Encoded Credentials, Missing Paths & Malformed Targets', () => {
    it('handles URL-encoded credentials with special characters safely without corrupting host/db', () => {
      const encodedUrl =
        'postgresql://test_user%40domain.internal:P%40%24%24w0rd%21%23%25@localhost:5432/campusbite_test';
      const result = assertSafeTestDatabase(encodedUrl);

      expect(result.host).toBe('localhost');
      expect(result.database).toBe('campusbite_test');
    });

    it('rejects absent, empty, or whitespace-only database URLs', () => {
      expect(() => assertSafeTestDatabase(undefined)).toThrowError(/Database URL is absent or empty/);
      expect(() => assertSafeTestDatabase('')).toThrowError(/Database URL is absent or empty/);
      expect(() => assertSafeTestDatabase('   ')).toThrowError(/Database URL is absent or empty/);
    });

    it('rejects URLs missing database path', () => {
      expect(() => assertSafeTestDatabase('postgresql://localhost:5432')).toThrowError(/not an approved test database/);
      expect(() => assertSafeTestDatabase('postgresql://localhost:5432/')).toThrowError(/not an approved test database/);
    });

    it('rejects malformed URLs or non-postgres protocols', () => {
      expect(() => assertSafeTestDatabase('http://localhost:5432/campusbite_test')).toThrowError(/Expected "postgresql"/);
      expect(() => assertSafeTestDatabase('mysql://localhost:3306/campusbite_test')).toThrowError(/Expected "postgresql"/);
      expect(() => assertSafeTestDatabase('not-even-a-url')).toThrowError(DatabaseSafetyError);
    });
  });

  describe('5. Destructive Cleanup Capability Token Protection', () => {
    it('rejects cleanDatabase invocations that lack the TEST_CLEANUP_CAPABILITY symbol', () => {
      expect(() => {
        assertTestCleanupCapability(undefined, VALID_LOCAL_TEST_URL);
      }).toThrowError(/without valid TEST_CLEANUP_CAPABILITY token/);

      expect(() => {
        assertTestCleanupCapability('FAKE_TOKEN' as any, VALID_LOCAL_TEST_URL);
      }).toThrowError(/without valid TEST_CLEANUP_CAPABILITY token/);

      expect(() => {
        assertTestCleanupCapability(Symbol('DIFFERENT_SYMBOL'), VALID_LOCAL_TEST_URL);
      }).toThrowError(/without valid TEST_CLEANUP_CAPABILITY token/);
    });

    it('prohibits accidental activation via environment variable string or boolean', () => {
      // Ordinary environment variable values passed as token must be rejected
      const envStringValues = ['true', 'TRUE', '1', 'TEST_CLEANUP_CAPABILITY', 'CAMPUSBITE_TEST_CLEANUP_CAPABILITY'];
      for (const val of envStringValues) {
        expect(() => {
          assertTestCleanupCapability(val as any, VALID_LOCAL_TEST_URL);
        }).toThrowError(/without valid TEST_CLEANUP_CAPABILITY token/);
      }
    });

    it('rejects cleanDatabase even WITH the valid token if targeting production', () => {
      expect(() => {
        assertTestCleanupCapability(TEST_CLEANUP_CAPABILITY, PRODUCTION_NEON_DIRECT_URL);
      }).toThrowError(DatabaseSafetyError);

      expect(() => {
        assertTestCleanupCapability(TEST_CLEANUP_CAPABILITY, PRODUCTION_NEON_POOLED_URL);
      }).toThrowError(DatabaseSafetyError);
    });

    it('permits cleanDatabase ONLY when both valid token AND safe test DB are confirmed', () => {
      expect(() => {
        assertTestCleanupCapability(TEST_CLEANUP_CAPABILITY, VALID_LOCAL_TEST_URL);
      }).not.toThrow();

      expect(() => {
        assertTestCleanupCapability(TEST_CLEANUP_CAPABILITY, VALID_LOCAL_IPV6_TEST_URL);
      }).not.toThrow();
    });
  });

  describe('6. Redacted Diagnostics & Reporting Safety', () => {
    it('generates a safety report with zero credential leakage', () => {
      const sensitiveUrl =
        'postgresql://admin_user:SuperSecretPassword123!@ep-shy-rain-azmt3i55-pooler.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require&apiKey=secretKey123';

      const report = getDatabaseSafetyReport(sensitiveUrl, 'test');

      expect(report.isSafeForTests).toBe(false);
      expect(report.isProductionHost).toBe(true);
      expect(report.host).toContain('neon.tech');
      expect(report.database).toBe('campusbite');

      const stringified = JSON.stringify(report);
      expect(stringified).not.toContain('SuperSecretPassword123!');
      expect(stringified).not.toContain('admin_user');
      expect(stringified).not.toContain('secretKey123');
    });
  });

  describe('7. CORS Test Decoupling Verification', () => {
    it('verifies that cors.test.ts has no cleanDatabase or prisma delete operations', () => {
      const corsTestFile = path.resolve(__dirname, 'cors.test.ts');
      const content = fs.readFileSync(corsTestFile, 'utf-8');

      expect(content).not.toContain('cleanDatabase');
      expect(content).not.toContain('deleteMany');
      expect(content).not.toContain('prisma');
    });
  });
});
