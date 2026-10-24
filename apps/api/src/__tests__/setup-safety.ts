import dotenv from 'dotenv';
import path from 'path';
import { assertSafeTestDatabase } from '../database/safety-guard.js';

// FAIL-CLOSED VITEST RUNNER SAFETY GATE:
// Executes before any test suite runs.
// Validates that NODE_ENV is 'test' and DATABASE_URL targets an approved, isolated test database.

// Preload test environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.test.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.test') });

if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    `CRITICAL TEST RUNNER SAFETY VIOLATION: Test runner started with NODE_ENV="${process.env.NODE_ENV}". Refusing to run tests. Set NODE_ENV=test.`
  );
}

const targetDbUrl = process.env.DATABASE_URL;

if (!targetDbUrl || !targetDbUrl.trim()) {
  throw new Error(
    'CRITICAL TEST RUNNER SAFETY VIOLATION: DATABASE_URL is absent. Refusing to run tests without an explicitly configured isolated test database (e.g. postgresql://postgres:postgres@localhost:5432/campusbite_test).'
  );
}

// Fail-closed verification: blocks Neon, cloud hosts, dev database, and unapproved names
assertSafeTestDatabase(targetDbUrl, 'Vitest Global Setup');
