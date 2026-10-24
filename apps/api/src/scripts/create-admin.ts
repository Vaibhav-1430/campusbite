import { Role } from '@campusbite/shared';
import { prisma } from '../database/prisma.js';
import { hashPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export interface CreateAdminOptions {
  email?: string;
  name?: string;
  password?: string;
  removeOtherAdmins?: boolean;
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
  removedOtherAdminsCount?: number;
  message: string;
}

/**
 * Safely removes other administrator accounts while strictly preserving non-admin staff accounts (COUNTER, KITCHEN).
 * Reassigns or cleans up dependent records (audit logs, order histories, adjustments) to prevent foreign key violations.
 */
export const removeOtherAdminAccounts = async (preserveUserId: string, preserveEmail: string): Promise<number> => {
  const otherAdmins = await prisma.user.findMany({
    where: {
      role: Role.ADMIN,
      id: { not: preserveUserId },
      email: { not: preserveEmail.toLowerCase() }
    },
    select: { id: true, email: true }
  });

  if (otherAdmins.length === 0) {
    return 0;
  }

  for (const admin of otherAdmins) {
    // 1. Audit logs: delete audit logs where actorId = admin.id
    await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });

    // 2. Status history entries: delete entries changed by this admin
    await prisma.orderStatusHistory.deleteMany({ where: { changedById: admin.id } });

    // 3. Prep adjustments: delete adjustments made by this admin
    await prisma.preparationTimeAdjustment.deleteMany({ where: { staffId: admin.id } });

    // 4. Inventory movements: delete movements performed by this admin
    await prisma.inventoryMovement.deleteMany({ where: { performedById: admin.id } });

    // 5. Orders: reassign createdBy or clear assignedTo to preserve order integrity
    await prisma.order.updateMany({
      where: { createdById: admin.id },
      data: { createdById: preserveUserId }
    });
    await prisma.order.updateMany({
      where: { assignedToId: admin.id },
      data: { assignedToId: null }
    });

    // 6. Delete other admin safely
    await prisma.user.delete({
      where: { id: admin.id }
    });

    logger.info(`Safely removed previous administrator: ${admin.email}`, 'CreateAdmin');
  }

  return otherAdmins.length;
};

/**
 * Creates a new administrator account safely.
 * - Validates email format and password strength.
 * - Checks if the email already exists to prevent duplicate creation or overwrites.
 * - Securely hashes the password with bcrypt (salt cost factor 10).
 * - Never logs or exposes plaintext passwords, hashes, or tokens.
 * - Optionally removes all other administrator accounts while preserving staff accounts.
 */
export const createAdminAccount = async (options: CreateAdminOptions = {}): Promise<CreateAdminResult> => {
  const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')));

  const email = (
    options.email ||
    process.env.ADMIN_EMAIL ||
    positionalArgs[0] ||
    'cafe47@campusbite.internal'
  ).trim().toLowerCase();

  const name = (
    options.name ||
    process.env.ADMIN_NAME ||
    positionalArgs[1] ||
    'Campus Administrator'
  ).trim();

  const password = options.password || process.env.ADMIN_PASSWORD || positionalArgs[2] || 'Adminhumai47';

  const shouldPreserveExistingAdmins =
    flags.has('--preserve-existing-admins') ||
    flags.has('--preserve-other-admins') ||
    flags.has('--keep-other-admins') ||
    process.env.PRESERVE_EXISTING_ADMINS === 'true' ||
    process.env.REMOVE_OTHER_ADMINS === 'false';

  const shouldRemoveOtherAdmins =
    options.removeOtherAdmins !== undefined
      ? options.removeOtherAdmins
      : !shouldPreserveExistingAdmins &&
        (flags.has('--remove-other-admins') ||
         flags.has('--remove-all-other-admins') ||
         process.env.REMOVE_OTHER_ADMINS === 'true');

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
      logger.warn(`Account already exists for email "${email}" with role "${existing.role}". No overwrite performed.`, 'CreateAdmin');
      
      let removedCount = 0;
      if (shouldRemoveOtherAdmins) {
        removedCount = await removeOtherAdminAccounts(existing.id, email);
      }

      return {
        status: 'ALREADY_EXISTS',
        user: existing,
        removedOtherAdminsCount: removedCount,
        message: `An account with email "${email}" already exists (role: ${existing.role}). Existing accounts cannot be overwritten.${
          removedCount > 0 ? ` Removed ${removedCount} other administrator account(s).` : ''
        }`
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

    let removedCount = 0;
    if (shouldRemoveOtherAdmins) {
      removedCount = await removeOtherAdminAccounts(user.id, email);
    }

    return {
      status: 'CREATED',
      user,
      removedOtherAdminsCount: removedCount,
      message: `Administrator account successfully created for ${user.email}.${
        removedCount > 0 ? ` Removed ${removedCount} other administrator account(s).` : ''
      }`
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
        if (result.removedOtherAdminsCount && result.removedOtherAdminsCount > 0) {
          console.log(`SUCCESS: Removed ${result.removedOtherAdminsCount} other administrator account(s).`);
        }
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
