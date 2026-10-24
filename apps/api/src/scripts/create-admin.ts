import { Role } from '@campusbite/shared';
import { prisma } from '../database/prisma.js';
import { hashPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export interface CreateAdminOptions {
  email?: string;
  name?: string;
  password?: string;
}

export interface CreateAdminResult {
  status: 'CREATED' | 'ALREADY_EXISTS' | 'FAILED';
  user?: {
    id: string;
    email: string;
    name: string;
    role: Role;
    isActive: boolean;
  };
  message: string;
}

/**
 * Creates a new administrator account safely.
 * - Validates email format and password strength.
 * - Checks if the email already exists to prevent duplicate creation or overwrites.
 * - Securely hashes the password with bcrypt (salt cost factor 10).
 * - Never logs or exposes plaintext passwords, hashes, or tokens.
 */
export const createAdminAccount = async (options: CreateAdminOptions = {}): Promise<CreateAdminResult> => {
  const email = (
    options.email ||
    process.env.ADMIN_EMAIL ||
    process.argv[2] ||
    'owner@campusbite.internal'
  ).trim().toLowerCase();

  const name = (
    options.name ||
    process.env.ADMIN_NAME ||
    process.argv[3] ||
    'Campus Owner'
  ).trim();

  const password = options.password || process.env.ADMIN_PASSWORD || process.argv[4] || 'Adminhumai47';

  // 1. Validate Email format
  if (!email.includes('@') || !email.includes('.')) {
    throw new Error(`Invalid email address format: "${email}"`);
  }

  // 2. Validate Password strength
  const minLength = env.NODE_ENV === 'production' ? 12 : 8;
  if (!password || password.length < minLength) {
    throw new Error(`Administrator password must be at least ${minLength} characters long.`);
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isHighEntropy = password.length >= 32;

  if (!isHighEntropy && (!hasUpper || !hasLower || !hasNumber)) {
    throw new Error('Administrator password must include uppercase, lowercase, and numbers.');
  }

  try {
    // 3. Check whether the email already exists before creating
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, isActive: true }
    });

    if (existing) {
      logger.warn(`Account already exists for email "${email}" with role "${existing.role}". No modifications made.`, 'CreateAdmin');
      return {
        status: 'ALREADY_EXISTS',
        user: existing,
        message: `An account with email "${email}" already exists (role: ${existing.role}). Existing accounts cannot be overwritten.`
      };
    }

    // 4. Hash password using project's bcrypt utility
    const passwordHash = await hashPassword(password);

    // 5. Create new administrator
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        tokenVersion: 1
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    });

    logger.info(`Administrator account created successfully: id=${user.id}, email=${user.email}`, 'CreateAdmin');

    return {
      status: 'CREATED',
      user,
      message: `Administrator account successfully created for ${user.email}.`
    };
  } finally {
    if (process.argv[1]?.includes('create-admin')) {
      await prisma.$disconnect();
    }
  }
};

// Execute if run directly from CLI
if (process.argv[1]?.includes('create-admin')) {
  createAdminAccount()
    .then((result) => {
      if (result.status === 'CREATED') {
        console.log(`SUCCESS: Administrator account created for ${result.user?.email}`);
        process.exit(0);
      } else if (result.status === 'ALREADY_EXISTS') {
        console.log(`NOTICE: ${result.message}`);
        process.exit(0);
      } else {
        console.error(`ERROR: ${result.message}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error during administrator creation:', err.message);
      process.exit(1);
    });
}
