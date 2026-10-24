# CampusBite — Database Safety, Isolation & Multi-Environment Architecture

## Overview & Incident Prevention

Following the October 24, 2026 incident where an integration test connected to the production Neon database and executed `deleteMany()`, CampusBite implements **fail-closed, multi-layered safeguards** across all environments.

Under no circumstances can automated tests, development scripts, or database reset utilities execute against a production database target.

---

## 1. Environment Classification & Target Policies

| Environment | `NODE_ENV` | Approved Target Host(s) | Database Name Pattern | Destructive Operations Allowed? |
|---|---|---|---|---|
| **Test** | `test` | `localhost`, `127.0.0.1`, `postgres` (CI container) | Strictly must end with `_test` or `_ci` (e.g. `campusbite_test`, `campusbite_ci`) | **YES** (Only with `TEST_CLEANUP_CAPABILITY` token in isolated test DB) |
| **Development** | `development` | `localhost`, `127.0.0.1` | `campusbite_dev` | **MANUAL ONLY** (Scripts blocked from cloud/production hosts) |
| **Staging** | `staging` | Isolated managed branch (e.g. `staging` branch on Neon) | `campusbite_staging` | **NO** (Must follow deployment workflow) |
| **Production** | `production` | Managed cloud endpoint (`ep-*-pooler.*.neon.tech`) | `campusbite` | **STRICTLY PROHIBITED** (Zero resets, zero test execution) |

---

## 2. Fail-Closed Protections Implemented (Phase B)

1. **Centralized Database Safety Guard (`apps/api/src/database/safety-guard.ts`)**:
   - Executes before `PrismaClient` connects or any destructive cleanup function runs.
   - Evaluates:
     - `NODE_ENV === 'test'`.
     - Reject known cloud/production providers: `*.neon.tech`, `*.render.com`, `*.amazonaws.com`, `*.supabase.co`.
     - Explicit host allowlist: `['localhost', '127.0.0.1', '::1', 'postgres']`.
     - Database name compliance: must end with `_test` or `_ci`.
2. **Capability Token Gating (`TEST_CLEANUP_CAPABILITY`)**:
   - `cleanDatabase()` in `apps/api/src/__tests__/test-helper.ts` requires a unique `Symbol` token. Production runtime code cannot obtain this token.
   - Even if the token is passed, `assertTestCleanupCapability()` validates that the database is an approved test database before running `deleteMany()`.
3. **Decoupled CORS & Preflight Tests**:
   - `apps/api/src/__tests__/cors.test.ts` has had all `cleanDatabase()` and `prisma` calls removed. CORS and header tests run purely against HTTP middleware without touching database tables.
4. **Environment File Isolation**:
   - In `apps/api/src/config/env.ts`, running with `NODE_ENV=test` prioritizes `.env.test.local` and `.env.test`. It never loads production credentials.
   - `.gitignore` ignores all `.env*` files except `.env.example` and `.env.test.example`.
5. **Vitest Global Safety Setup (`apps/api/src/__tests__/setup-safety.ts`)**:
   - Configured in `apps/api/vitest.config.ts`.
   - Halts the test runner immediately if `DATABASE_URL` is missing, malformed, or points to a non-test database.

---

## 3. Database Roles & Principle of Least Privilege

To maintain defense-in-depth, configure separate database roles in PostgreSQL:

### A. Production Application Role (`campusbite_app`)
- **Granted Permissions**: `SELECT`, `INSERT`, `UPDATE` on public tables.
- **Explicit Denials**: `DROP TABLE`, `TRUNCATE`, `ALTER TABLE`, `CREATE TABLE`.
- **Purpose**: Used exclusively by the deployed Render API service.

### B. Production Migration Role (`campusbite_migrator`)
- **Granted Permissions**: `ALL PRIVILEGES` on schema `public`.
- **Restrictions**: Strictly used during deployment (`npx prisma migrate deploy`), never by the runtime web process.

### C. Test Database Role (`campusbite_tester`)
- **Target**: Dedicated local/CI database only (`campusbite_test` / `campusbite_ci`).
- **Permissions**: `SELECT`, `INSERT`, `UPDATE`, `DELETE` within `campusbite_test`.
- **Restrictions**: Must NOT have access to production network, production credentials, or production databases.

---

## 4. Safe Diagnostic Utility

To verify the safety compliance of your current environment configuration without leaking credentials, run:

```bash
# In monorepo root:
npm run db:check:safety

# Or within apps/api:
npm run db:check:safety --workspace=@campusbite/api
```

This diagnostic script outputs:
- Target host (with credentials and secrets redacted).
- Database name.
- Cloud / Neon detection status.
- Policy compliance for the active `NODE_ENV`.
