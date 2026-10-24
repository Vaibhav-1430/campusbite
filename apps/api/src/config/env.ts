import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { sanitizeAndEnhanceDbUrl } from '../database/connection-url.js';
import { assertSafeTestDatabase } from '../database/safety-guard.js';

// Environment variable resolution:
// When running in test mode (NODE_ENV === 'test'), strictly prioritize dedicated test env files
// and forbid loading production/development credentials from .env or apps/api/.env
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.test.local') });
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.test') });
} else if (process.env.NODE_ENV !== 'production' || !process.env.DATABASE_URL) {
  // In production, environment variables provided by the container/orchestrator (e.g. Render)
  // are the authoritative source of truth. Only load local .env files when running locally
  // or when DATABASE_URL is not already supplied in the process environment.
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(5000),
    DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }),
    JWT_SECRET: z.string({ required_error: 'JWT_SECRET is required' }).min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('8h'),
    COOKIE_DOMAIN: z.string().default(''),
    CORS_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173,https://campusbite112.netlify.app'),
    INITIAL_ADMIN_NAME: z.string().default('System Administrator'),
    INITIAL_ADMIN_EMAIL: z.string().default('admin@campusbite.internal'),
    INITIAL_ADMIN_PASSWORD: z.string().default('AdminPassword123!')
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'test') {
      try {
        assertSafeTestDatabase(data.DATABASE_URL, 'Environment validation (NODE_ENV=test)');
      } catch (err: any) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: err.message
        });
      }
    }

    if (data.NODE_ENV === 'production') {
      if (
        data.JWT_SECRET.toLowerCase().includes('dev') ||
        data.JWT_SECRET.toLowerCase().includes('secret_jwt_key') ||
        data.JWT_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message:
            'CRITICAL SECURITY: In production, JWT_SECRET must be an unpredictable, random 32+ character entropy string, not the development default.'
        });
      }

      if (data.INITIAL_ADMIN_PASSWORD === 'AdminPassword123!') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INITIAL_ADMIN_PASSWORD'],
          message:
            'CRITICAL SECURITY: Default password "AdminPassword123!" is prohibited in production. You must set a unique, strong INITIAL_ADMIN_PASSWORD.'
        });
      }

      if (data.DATABASE_URL.includes('localhost') || data.DATABASE_URL.includes('127.0.0.1')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'Production DATABASE_URL must reference a managed production database, not localhost.'
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

// Ensure process.env.DATABASE_URL and exported env.DATABASE_URL are enhanced with serverless resilience
const enhancedDatabaseUrl = sanitizeAndEnhanceDbUrl(parsed.data.DATABASE_URL);
process.env.DATABASE_URL = enhancedDatabaseUrl;
parsed.data.DATABASE_URL = enhancedDatabaseUrl;

export const env = parsed.data;
