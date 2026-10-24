import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import {
  assertSafeDevelopmentDatabase,
  assertSafeMigrateDevEnvironment,
  findMonorepoRoot
} from '../database/safety-guard.js';

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
 * Loads development environment configuration with explicit, intentional precedence:
 * 1. Process environment (shell, CLI) - HIGHEST PRECEDENCE (never overwritten by dotenv).
 * 2. Local workspace override (apps/api/.env.local).
 * 3. Repository root override (.env.local).
 * 4. App workspace configuration (apps/api/.env).
 * 5. Repository root fallback (.env) - LOWEST FILE PRECEDENCE.
 */
export function loadDevelopmentEnvironment(repoRoot: string): void {
  dotenv.config({ path: path.resolve(repoRoot, 'apps/api/.env.local') });
  dotenv.config({ path: path.resolve(repoRoot, '.env.local') });
  dotenv.config({ path: path.resolve(repoRoot, 'apps/api/.env') });
  dotenv.config({ path: path.resolve(repoRoot, '.env') });
}

const repoRoot = findMonorepoRoot(process.cwd());
loadDevelopmentEnvironment(repoRoot);

export function runMigrateDev(): void {
  let effectiveEnv: string;
  try {
    effectiveEnv = assertSafeMigrateDevEnvironment(process.env.NODE_ENV);
  } catch (err: unknown) {
    console.error('----------------------------------------------------------------');
    console.error('[SAFETY ERROR] Development migration rejected:');
    console.error(err instanceof Error ? err.message : String(err));
    console.error('----------------------------------------------------------------');
    process.exit(1);
  }

  console.log('================================================================');
  console.log('           CampusBite Development Migration Engine              ');
  console.log('================================================================');
  console.log(`Target Environment (NODE_ENV) : ${effectiveEnv}`);

  const databaseUrl = process.env.DATABASE_URL;

  let targetInfo;
  try {
    targetInfo = assertSafeDevelopmentDatabase(databaseUrl, 'prisma migrate dev');
  } catch (err: unknown) {
    console.error('----------------------------------------------------------------');
    console.error('[SAFETY ERROR] Development migration rejected:');
    console.error(err instanceof Error ? err.message : String(err));
    console.error('----------------------------------------------------------------');
    process.exit(1);
  }

  console.log(`Database Provider            : ${targetInfo.provider}`);
  console.log(`Target Host Identifier       : ${targetInfo.host}`);
  console.log(`Target Port                  : ${targetInfo.port}`);
  console.log(`Target Database Name         : ${targetInfo.database}`);
  console.log('----------------------------------------------------------------');

  const schemaPath = path.resolve(repoRoot, 'apps/api/prisma/schema.prisma');
  const userArgs = process.argv.slice(2);
  const { executable, argsPrefix } = resolvePrismaCli(repoRoot);
  const args = [...argsPrefix, 'migrate', 'dev', `--schema=${schemaPath}`, ...userArgs];

  const loggedUserArgs = userArgs.length > 0 ? ` ${userArgs.join(' ')}` : '';
  console.log(`Executing: prisma migrate dev --schema="${schemaPath}"${loggedUserArgs}`);

  try {
    execFileSync(executable, args, {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl
      },
      stdio: 'inherit'
    });
    console.log('----------------------------------------------------------------');
    console.log('[SUCCESS] Development migration completed successfully.');
  } catch (err: unknown) {
    console.error('----------------------------------------------------------------');
    console.error('[ERROR] Development migration failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (process.argv[1]?.includes('run-migrate-dev')) {
  runMigrateDev();
}
