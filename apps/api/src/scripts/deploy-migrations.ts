import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { resolveAndValidateMigrationUrl, findMonorepoRoot } from '../database/safety-guard.js';

export { findMonorepoRoot };

/**
 * Resolves the Prisma CLI executable and arguments prefix for execution via execFileSync.
 * Directly runs the local Prisma CLI entrypoint with process.execPath (Node) avoiding shell interpolation
 * and Windows cmd.exe security restrictions (CVE-2024-27980).
 */
export function resolvePrismaCli(repoRoot: string): { executable: string; argsPrefix: string[] } {
  try {
    const req = createRequire(import.meta.url);
    const prismaEntry = req.resolve('prisma');
    return { executable: process.execPath, argsPrefix: [prismaEntry] };
  } catch {
    const rootPrisma = path.resolve(repoRoot, 'node_modules/prisma/build/index.js');
    if (fs.existsSync(rootPrisma)) {
      return { executable: process.execPath, argsPrefix: [rootPrisma] };
    }
    const apiPrisma = path.resolve(repoRoot, 'apps/api/node_modules/prisma/build/index.js');
    if (fs.existsSync(apiPrisma)) {
      return { executable: process.execPath, argsPrefix: [apiPrisma] };
    }
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    return { executable: npxCmd, argsPrefix: ['prisma'] };
  }
}

/**
 * Loads environment configuration with explicit, intentional precedence:
 * 1. Process environment (shell, CI, Render) - HIGHEST PRECEDENCE (never overwritten by dotenv).
 * 2. Local workspace override (apps/api/.env.local or apps/api/.env.test.local).
 * 3. Repository root override (.env.local or .env.test.local).
 * 4. App workspace configuration (apps/api/.env or apps/api/.env.test).
 * 5. Repository root fallback (.env or .env.test) - LOWEST FILE PRECEDENCE.
 */
export function loadEnvironment(repoRoot: string, nodeEnv?: string): void {
  const isTest = nodeEnv === 'test';
  if (isTest) {
    dotenv.config({ path: path.resolve(repoRoot, 'apps/api/.env.test.local') });
    dotenv.config({ path: path.resolve(repoRoot, '.env.test.local') });
    dotenv.config({ path: path.resolve(repoRoot, 'apps/api/.env.test') });
    dotenv.config({ path: path.resolve(repoRoot, '.env.test') });
  } else {
    dotenv.config({ path: path.resolve(repoRoot, 'apps/api/.env.local') });
    dotenv.config({ path: path.resolve(repoRoot, '.env.local') });
    dotenv.config({ path: path.resolve(repoRoot, 'apps/api/.env') });
    dotenv.config({ path: path.resolve(repoRoot, '.env') });
  }
}

const repoRoot = findMonorepoRoot(process.cwd());
loadEnvironment(repoRoot, process.env.NODE_ENV);

export function runMigrationDeployment(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log('================================================================');
  console.log('            CampusBite Migration Deployment Engine              ');
  console.log('================================================================');
  console.log(`Target Environment (NODE_ENV) : ${nodeEnv}`);

  let resolvedTarget;
  try {
    resolvedTarget = resolveAndValidateMigrationUrl({ nodeEnv });
  } catch (err: unknown) {
    console.error('----------------------------------------------------------------');
    console.error('[SAFETY ERROR] Migration target rejected by safety guard:');
    console.error(err instanceof Error ? err.message : String(err));
    console.error('----------------------------------------------------------------');
    process.exit(1);
  }

  const { migrationUrl, sourceVariable, targetInfo } = resolvedTarget;

  // Redact sensitive details for display
  const displayHost = targetInfo.isNeon
    ? `${targetInfo.host.substring(0, 6)}***.neon.tech`
    : targetInfo.host;

  console.log(`Resolved Source Variable     : ${sourceVariable}`);
  console.log(`Database Provider            : ${targetInfo.provider}`);
  console.log(`Target Host Identifier       : ${displayHost}`);
  console.log(`Target Port                  : ${targetInfo.port}`);
  console.log(`Target Database Name         : ${targetInfo.database}`);
  console.log(`Pooled Endpoint (-pooler)    : ${targetInfo.isPooled}`);
  console.log('----------------------------------------------------------------');

  const schemaPath = path.resolve(repoRoot, 'apps/api/prisma/schema.prisma');
  const { executable, argsPrefix } = resolvePrismaCli(repoRoot);
  const args = [...argsPrefix, 'migrate', 'deploy', `--schema=${schemaPath}`];

  console.log(`Executing: prisma migrate deploy --schema="${schemaPath}"`);
  try {
    execFileSync(executable, args, {
      env: {
        ...process.env,
        DATABASE_URL: migrationUrl
      },
      stdio: 'inherit'
    });
    console.log('----------------------------------------------------------------');
    console.log('[SUCCESS] Migration deployment completed successfully.');
  } catch (err: unknown) {
    console.error('----------------------------------------------------------------');
    console.error('[ERROR] Migration deployment failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Execute when invoked directly
if (process.argv[1]?.includes('deploy-migrations')) {
  runMigrationDeployment();
}
