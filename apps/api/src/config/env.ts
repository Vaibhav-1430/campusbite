import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from api directory or monorepo root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }),
  JWT_SECRET: z.string({ required_error: 'JWT_SECRET is required' }).min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  COOKIE_DOMAIN: z.string().default(''),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  INITIAL_ADMIN_NAME: z.string().default('System Administrator'),
  INITIAL_ADMIN_EMAIL: z.string().default('admin@campusbite.internal'),
  INITIAL_ADMIN_PASSWORD: z.string().default('AdminPassword123!')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
