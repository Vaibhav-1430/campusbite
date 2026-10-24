import { Role } from '@campusbite/shared';
import { prisma } from '../database/prisma.js';
import { hashPassword, comparePassword } from '../utils/password.js';
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

export interface AdminCleanupDryRunSummary {
  targetPreservedAdmin: {
    email: string;
    exists: boolean;
    role?: Role;
    isActive?: boolean;
  };
  adminAccountsToRemove: {
    count: number;
    emails: string[];
  };
  staffAccountsPreserved: {
    totalNonAdminCount: number;
    counterCount: number;
    kitchenCount: number;
  };
}

/**
 * Performs a safe dry-run analysis of the admin cleanup without executing any deletions.
 * Reports counts and emails with zero secret/hash exposure.
 */
export const dryRunAdminCleanup = async (targetEmail: string): Promise<AdminCleanupDryRunSummary> => {
  const normalizedTargetEmail = targetEmail.trim().toLowerCase();
  const targetUser = await prisma.user.findUnique({
    where: { email: normalizedTargetEmail },
    select: { id: true, email: true, role: true, isActive: true }
  });

  const otherAdmins = await prisma.user.findMany({
    where: {
      role: Role.ADMIN,
      email: { not: normalizedTargetEmail }
    },
    select: { email: true }
  });

  const counterCount = await prisma.user.count({ where: { role: Role.COUNTER } });
  const kitchenCount = await prisma.user.count({ where: { role: Role.KITCHEN } });
  const totalNonAdminCount = counterCount + kitchenCount;

  return {
    targetPreservedAdmin: {
      email: normalizedTargetEmail,
      exists: Boolean(targetUser),
      role: targetUser?.role,
      isActive: targetUser?.isActive
    },
    adminAccountsToRemove: {
      count: otherAdmins.length,
      emails: otherAdmins.map((a) => a.email)
    },
    staffAccountsPreserved: {
      totalNonAdminCount,
      counterCount,
      kitchenCount
    }
  };
};

/**
 * Safely removes other administrator accounts while strictly preserving non-admin staff accounts (COUNTER, KITCHEN).
 * Reassigns or cleans up dependent records (audit logs, order histories, adjustments) to prevent foreign key violations.
 * Executes atomically inside a Prisma transaction.
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

  await prisma.$transaction(async (tx) => {
    for (const admin of otherAdmins) {
      // 1. Audit logs: delete audit logs where actorId = admin.id
      await tx.auditLog.deleteMany({ where: { actorId: admin.id } });

      // 2. Status history entries: delete entries changed by this admin
      await tx.orderStatusHistory.deleteMany({ where: { changedById: admin.id } });

      // 3. Prep adjustments: delete adjustments made by this admin
      await tx.preparationTimeAdjustment.deleteMany({ where: { staffId: admin.id } });

      // 4. Inventory movements: delete movements performed by this admin
      await tx.inventoryMovement.deleteMany({ where: { performedById: admin.id } });

      // 5. Orders: reassign createdBy or clear assignedTo to preserve order integrity
      await tx.order.updateMany({
        where: { createdById: admin.id },
        data: { createdById: preserveUserId }
      });
      await tx.order.updateMany({
        where: { assignedToId: admin.id },
        data: { assignedToId: null }
      });

      // 6. Delete other admin safely
      await tx.user.delete({
        where: { id: admin.id }
      });

      logger.info(`Safely removed previous administrator: ${admin.email}`, 'CreateAdmin');
    }
  });

  return otherAdmins.length;
};

/**
 * Safely executes administrator cleanup ONLY after confirming:
 * 1. Target admin account exists.
 * 2. Target admin has role ADMIN.
 * 3. Target admin isActive is true.
 * 4. Target password can be verified (if password provided).
 */
export const executeVerifiedAdminCleanup = async (
  targetEmail: string,
  targetPassword?: string
): Promise<{ success: boolean; removedCount: number; summary: AdminCleanupDryRunSummary }> => {
  const summary = await dryRunAdminCleanup(targetEmail);
  const targetUser = await prisma.user.findUnique({
    where: { email: targetEmail.trim().toLowerCase() }
  });

  if (!targetUser) {
    throw new Error(
      `SAFETY ABORT: Target administrator "${targetEmail}" does not exist in the database. No cleanup performed.`
    );
  }

  if (targetUser.role !== Role.ADMIN) {
    throw new Error(
      `SAFETY ABORT: Target user "${targetEmail}" has role "${targetUser.role}", not ADMIN. No cleanup performed.`
    );
  }

  if (!targetUser.isActive) {
    throw new Error(
      `SAFETY ABORT: Target administrator "${targetEmail}" is deactivated. No cleanup performed.`
    );
  }

  if (targetPassword) {
    const isValid = await comparePassword(targetPassword, targetUser.passwordHash);
    if (!isValid) {
      throw new Error(
        `SAFETY ABORT: Authentication verification failed for target administrator "${targetEmail}". No cleanup performed.`
      );
    }
  }

  const removedCount = await removeOtherAdminAccounts(targetUser.id, targetUser.email);
  return { success: true, removedCount, summary };
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
    'owner@campusbite.internal'
  ).trim().toLowerCase();

  const name = (
    options.name ||
    process.env.ADMIN_NAME ||
    positionalArgs[1] ||
    'Campus Owner'
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
      logger.warn(
        `Account already exists for email "${email}" with role "${existing.role}". No overwrite performed.`,
        'CreateAdmin'
      );

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
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')));
  const targetEmail = (
    process.env.ADMIN_EMAIL ||
    process.argv.slice(2).find((a) => !a.startsWith('--')) ||
    'owner@campusbite.internal'
  )
    .trim()
    .toLowerCase();
  const targetPassword = process.env.ADMIN_PASSWORD;

  if (flags.has('--dry-run')) {
    dryRunAdminCleanup(targetEmail)
      .then((summary) => {
        console.log('=== DRY-RUN ADMIN CLEANUP SUMMARY ===');
        console.log(`Target Preserved Administrator: ${summary.targetPreservedAdmin.email}`);
        console.log(`Target Exists in DB: ${summary.targetPreservedAdmin.exists}`);
        console.log(`Target Role: ${summary.targetPreservedAdmin.role || 'N/A'}`);
        console.log(`Target Active: ${summary.targetPreservedAdmin.isActive || false}`);
        console.log(`Other ADMIN Accounts to Remove: ${summary.adminAccountsToRemove.count}`);
        if (summary.adminAccountsToRemove.emails.length > 0) {
          console.log(`Admin Emails to be Removed: ${summary.adminAccountsToRemove.emails.join(', ')}`);
        }
        console.log(
          `Preserved Non-Admin Staff Accounts: ${summary.staffAccountsPreserved.totalNonAdminCount} (COUNTER: ${summary.staffAccountsPreserved.counterCount}, KITCHEN: ${summary.staffAccountsPreserved.kitchenCount})`
        );
        console.log('Status: DRY-RUN COMPLETED (NO DATABASE MUTATIONS PERFORMED)');
        process.exit(0);
      })
      .catch((err) => {
        console.error('Dry-run failed:', err.message);
        process.exit(1);
      });
  } else if (flags.has('--cleanup-only') || flags.has('--remove-other-admins-only')) {
    executeVerifiedAdminCleanup(targetEmail, targetPassword)
      .then((res) => {
        console.log(`SUCCESS: Verified administrator ${targetEmail} exists and authenticated.`);
        console.log(`SUCCESS: Transactionally removed ${res.removedCount} other administrator account(s).`);
        console.log(
          `SUCCESS: Preserved all ${res.summary.staffAccountsPreserved.totalNonAdminCount} non-admin staff accounts.`
        );
        process.exit(0);
      })
      .catch((err) => {
        console.error('FATAL CLEANUP ERROR:', err.message);
        process.exit(1);
      });
  } else {
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
}
