import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from api directory or monorepo root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
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

export const env = parsed.data;
