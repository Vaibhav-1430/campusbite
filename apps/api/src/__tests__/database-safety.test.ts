import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  assertSafeTestDatabase,
  assertSafeDevelopmentDatabase,
  assertSafeProductionMigration,
  assertSafeMigrateDevEnvironment,
  resolveAndValidateMigrationUrl,
  assertTestCleanupCapability,
  TEST_CLEANUP_CAPABILITY,
  DatabaseSafetyError,
  isApprovedTestDatabaseName,
  isProhibitedProductionHost,
  getDatabaseSafetyReport
} from '../database/safety-guard.js';
import { findMonorepoRoot } from '../scripts/deploy-migrations.js';

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

  describe('8. Migration Safety Gate & Role Verification', () => {
    const PROD_NEON_DIRECT_MIGRATOR =
      'postgresql://campusbite_migrator:migrator_secret_pass_123@ep-shy-rain-azmt3i55.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require';
    const PROD_NEON_POOLED_MIGRATOR =
      'postgresql://campusbite_migrator:migrator_secret_pass_123@ep-shy-rain-azmt3i55-pooler.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require&pgbouncer=true';
    const PROD_NEON_APP_DIRECT =
      'postgresql://campusbite_app:app_secret_pass_123@ep-shy-rain-azmt3i55.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require';
    const PROD_NEON_OWNER_DIRECT =
      'postgresql://neondb_owner:owner_pass_123@ep-shy-rain-azmt3i55.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require';
    const VALID_LOCAL_DEV_URL =
      'postgresql://postgres:password@localhost:5432/campusbite_dev';
    const VALID_LOCAL_TEST_URL =
      'postgresql://postgres:password@localhost:5432/campusbite_test?schema=public';

    describe('Development Mode Protections (Fail Closed Against Cloud / Production)', () => {
      it('fails closed when development mode DATABASE_URL targets Neon pooled endpoint', () => {
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'development',
            envVars: { DATABASE_URL: PRODUCTION_NEON_POOLED_URL }
          });
        }).toThrowError(DatabaseSafetyError);

        try {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'development',
            envVars: { DATABASE_URL: PRODUCTION_NEON_POOLED_URL }
          });
        } catch (err: any) {
          expect(err.message).toContain('Migration command running in development mode resolved to a cloud/production database target');
          expect(err.code).toBe('DATABASE_SAFETY_VIOLATION');
        }
      });

      it('fails closed when development mode DATABASE_URL targets Neon direct compute endpoint', () => {
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'development',
            envVars: { DATABASE_URL: PRODUCTION_NEON_DIRECT_URL }
          });
        }).toThrowError(DatabaseSafetyError);

        try {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'development',
            envVars: { DATABASE_URL: PRODUCTION_NEON_DIRECT_URL }
          });
        } catch (err: any) {
          expect(err.message).toContain('Migration command running in development mode resolved to a cloud/production database target');
          expect(err.code).toBe('DATABASE_SAFETY_VIOLATION');
        }
      });

      it('fails closed when development mode has MIGRATION_DATABASE_URL pointing to Neon', () => {
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'development',
            envVars: {
              MIGRATION_DATABASE_URL: PROD_NEON_DIRECT_MIGRATOR,
              DATABASE_URL: VALID_LOCAL_DEV_URL
            }
          });
        }).toThrowError(/resolved to a cloud\/production database target/);
      });

      it('fails closed when development mode targets production database name campusbite on localhost', () => {
        const prodDbOnLocal = 'postgresql://postgres:password@localhost:5432/campusbite';
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'development',
            envVars: { DATABASE_URL: prodDbOnLocal }
          });
        }).toThrowError(/production database name/);
      });

      it('fails closed when development mode targets external cloud providers', () => {
        const cloudUrl = 'postgresql://user:pass@dpg-abc123-a.oregon-postgres.render.com:5432/campusbite_dev';
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'development',
            envVars: { DATABASE_URL: cloudUrl }
          });
        }).toThrowError(DatabaseSafetyError);
      });

      it('allows development migrations when targeting valid local development database', () => {
        const result = resolveAndValidateMigrationUrl({
          nodeEnv: 'development',
          envVars: { DATABASE_URL: VALID_LOCAL_DEV_URL }
        });

        expect(result.migrationUrl).toBe(VALID_LOCAL_DEV_URL);
        expect(result.sourceVariable).toBe('DATABASE_URL');
        expect(result.targetInfo.host).toBe('localhost');
        expect(result.targetInfo.database).toBe('campusbite_dev');
        expect(result.nodeEnv).toBe('development');
      });

      it('assertSafeDevelopmentDatabase strictly rejects production database name and cloud hosts', () => {
        expect(() => assertSafeDevelopmentDatabase(PRODUCTION_NEON_DIRECT_URL)).toThrowError(/cloud\/production database/);
        expect(() => assertSafeDevelopmentDatabase('postgresql://postgres:pass@localhost:5432/campusbite')).toThrowError(/production database name/);
        expect(() => assertSafeDevelopmentDatabase('postgresql://postgres:pass@localhost:5432/production')).toThrowError(/production database name/);
        expect(() => assertSafeDevelopmentDatabase('postgresql://postgres:pass@54.210.12.34:5432/campusbite_dev')).toThrowError(/not an approved local development host/);
        expect(() => assertSafeDevelopmentDatabase(VALID_LOCAL_DEV_URL)).not.toThrow();
      });

      it('assertSafeMigrateDevEnvironment strictly rejects production, test, and non-development environments', () => {
        expect(() => assertSafeMigrateDevEnvironment('production')).toThrowError(
          /Cannot execute development migrations .* in a production environment/
        );
        expect(() => assertSafeMigrateDevEnvironment('prod')).toThrowError(
          /Cannot execute development migrations .* in a production environment/
        );
        expect(() => assertSafeMigrateDevEnvironment('test')).toThrowError(
          /strictly permitted only in "development" mode/
        );
        expect(() => assertSafeMigrateDevEnvironment('staging')).toThrowError(
          /strictly permitted only in "development" mode/
        );
        expect(() => assertSafeMigrateDevEnvironment('ci')).toThrowError(
          /strictly permitted only in "development" mode/
        );

        expect(assertSafeMigrateDevEnvironment('development')).toBe('development');
        expect(assertSafeMigrateDevEnvironment('dev')).toBe('dev');
        expect(assertSafeMigrateDevEnvironment(undefined)).toBe('development');
        expect(assertSafeMigrateDevEnvironment('')).toBe('development');
      });
    });

    describe('Production Migration Mode Protections (campusbite_migrator & Direct Endpoint)', () => {
      it('fails safely when MIGRATION_DATABASE_URL and DIRECT_URL are missing in production (never falls back to DATABASE_URL)', () => {
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'production',
            envVars: { DATABASE_URL: PROD_NEON_APP_DIRECT }
          });
        }).toThrowError(/In production, migrations require dedicated migration credentials/);

        // Even if DATABASE_URL is set to migrator, production mode MUST NOT silently fall back to it
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'production',
            envVars: { DATABASE_URL: PROD_NEON_DIRECT_MIGRATOR }
          });
        }).toThrowError(/In production, migrations require dedicated migration credentials/);
      });

      it('strictly rejects runtime application role campusbite_app in production migrations', () => {
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'production',
            envVars: { MIGRATION_DATABASE_URL: PROD_NEON_APP_DIRECT }
          });
        }).toThrowError(/Attempted to run migrations with runtime application user "campusbite_app"/);

        expect(() => {
          assertSafeProductionMigration(PROD_NEON_APP_DIRECT);
        }).toThrowError(/Attempted to run migrations with runtime application user "campusbite_app"/);
      });

      it('strictly rejects unauthorized administrative roles (e.g. neondb_owner, postgres) requiring dedicated campusbite_migrator', () => {
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'production',
            envVars: { MIGRATION_DATABASE_URL: PROD_NEON_OWNER_DIRECT }
          });
        }).toThrowError(/Production migrations require the dedicated "campusbite_migrator" role/);

        expect(() => {
          assertSafeProductionMigration(PROD_NEON_OWNER_DIRECT);
        }).toThrowError(/Production migrations require the dedicated "campusbite_migrator" role/);
      });

      it('strictly rejects pooled PgBouncer endpoints for production migrations', () => {
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'production',
            envVars: { MIGRATION_DATABASE_URL: PROD_NEON_POOLED_MIGRATOR }
          });
        }).toThrowError(/Production migrations cannot be executed against a pooled \(-pooler\) PgBouncer endpoint/);

        expect(() => {
          assertSafeProductionMigration(PROD_NEON_POOLED_MIGRATOR);
        }).toThrowError(/Production migrations cannot be executed against a pooled \(-pooler\) PgBouncer endpoint/);
      });

      it('accepts explicit MIGRATION_DATABASE_URL with campusbite_migrator on direct unpooled Neon endpoint', () => {
        const result = resolveAndValidateMigrationUrl({
          nodeEnv: 'production',
          envVars: { MIGRATION_DATABASE_URL: PROD_NEON_DIRECT_MIGRATOR }
        });

        expect(result.migrationUrl).toBe(PROD_NEON_DIRECT_MIGRATOR);
        expect(result.sourceVariable).toBe('MIGRATION_DATABASE_URL');
        expect(result.targetInfo.isPooled).toBe(false);
        expect(result.nodeEnv).toBe('production');
      });

      it('accepts explicit DIRECT_URL with campusbite_migrator on direct unpooled Neon endpoint', () => {
        const result = resolveAndValidateMigrationUrl({
          nodeEnv: 'production',
          envVars: { DIRECT_URL: PROD_NEON_DIRECT_MIGRATOR }
        });

        expect(result.migrationUrl).toBe(PROD_NEON_DIRECT_MIGRATOR);
        expect(result.sourceVariable).toBe('DIRECT_URL');
        expect(result.targetInfo.isPooled).toBe(false);
      });

      it('strictly enforces campusbite_migrator role for DIRECT_URL, rejecting owner, admin, and app roles', () => {
        const prodDirectOwner = 'postgresql://campusbite_owner:pass@ep-shy-rain-azmt3i55.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require';
        const prodDirectAdmin = 'postgresql://postgres:pass@ep-shy-rain-azmt3i55.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require';
        const prodDirectApp = 'postgresql://campusbite_app:pass@ep-shy-rain-azmt3i55.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require';
        const prodDirectPooled = 'postgresql://campusbite_migrator:pass@ep-shy-rain-azmt3i55-pooler.c-3.ap-southeast-1.aws.neon.tech:5432/campusbite?sslmode=require&pgbouncer=true';

        // Rejects owner role configured via DIRECT_URL
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'production',
            envVars: { DIRECT_URL: prodDirectOwner }
          });
        }).toThrowError(/Production migrations require the dedicated "campusbite_migrator" role/);

        // Rejects admin role configured via DIRECT_URL
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'production',
            envVars: { DIRECT_URL: prodDirectAdmin }
          });
        }).toThrowError(/Production migrations require the dedicated "campusbite_migrator" role/);

        // Rejects campusbite_app role configured via DIRECT_URL
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'production',
            envVars: { DIRECT_URL: prodDirectApp }
          });
        }).toThrowError(/Attempted to run migrations with runtime application user "campusbite_app"/);

        // Rejects pooled endpoint configured via DIRECT_URL
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'production',
            envVars: { DIRECT_URL: prodDirectPooled }
          });
        }).toThrowError(/Production migrations cannot be executed against a pooled \(-pooler\) PgBouncer endpoint/);
      });
    });

    describe('Test Mode Migration Protections', () => {
      it('permits test migrations targeting approved local test database', () => {
        const result = resolveAndValidateMigrationUrl({
          nodeEnv: 'test',
          envVars: { DATABASE_URL: VALID_LOCAL_TEST_URL }
        });

        expect(result.migrationUrl).toBe(VALID_LOCAL_TEST_URL);
        expect(result.targetInfo.database).toBe('campusbite_test');
      });

      it('rejects test migrations targeting production Neon database', () => {
        expect(() => {
          resolveAndValidateMigrationUrl({
            nodeEnv: 'test',
            envVars: { DATABASE_URL: PRODUCTION_NEON_DIRECT_URL }
          });
        }).toThrowError(DatabaseSafetyError);
      });
    });

    describe('Missing Credentials Safety', () => {
      it('fails safely when database URL is missing in any environment', () => {
        expect(() => resolveAndValidateMigrationUrl({ nodeEnv: 'development', envVars: {} })).toThrowError(
          /No database connection URL found/
        );
        expect(() => resolveAndValidateMigrationUrl({ nodeEnv: 'production', envVars: {} })).toThrowError(
          /Neither MIGRATION_DATABASE_URL nor DIRECT_URL is configured/
        );
        expect(() => resolveAndValidateMigrationUrl({ nodeEnv: 'test', envVars: {} })).toThrowError(
          /No database connection URL found/
        );
      });
    });

    describe('Monorepo Root Resolution & Working Directory Agnosticism', () => {
      it('correctly resolves repository root regardless of start directory', () => {
        const repoRoot = findMonorepoRoot(process.cwd());
        expect(fs.existsSync(path.resolve(repoRoot, 'package.json'))).toBe(true);

        const pkg = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'package.json'), 'utf-8'));
        expect(pkg.workspaces).toBeDefined();

        // Testing from nested apps/api
        const fromApi = findMonorepoRoot(path.resolve(repoRoot, 'apps/api'));
        expect(fromApi).toBe(repoRoot);

        // Testing from nested scripts directory
        const fromScripts = findMonorepoRoot(path.resolve(repoRoot, 'apps/api/src/scripts'));
        expect(fromScripts).toBe(repoRoot);
      });
    });
  });
});
