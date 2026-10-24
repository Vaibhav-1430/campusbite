import { Role } from '@campusbite/shared';
import { prisma } from '../database/prisma.js';
import { hashPassword } from '../utils/password.js';
import { generateToken } from '../utils/token.js';
import {
  TEST_CLEANUP_CAPABILITY,
  assertTestCleanupCapability,
  assertSafeTestDatabase
} from '../database/safety-guard.js';

export { TEST_CLEANUP_CAPABILITY };

/**
 * Destructively cleans business tables in an isolated test database.
 * FAIL-CLOSED SAFETY:
 * 1. Requires explicit TEST_CLEANUP_CAPABILITY capability token.
 * 2. Strictly verifies NODE_ENV === 'test'.
 * 3. Strictly verifies that the target database is an approved isolated test database
 *    (e.g. localhost, campusbite_test). Prohibits any connection to production/Neon.
 */
export const cleanDatabase = async (capability: symbol = TEST_CLEANUP_CAPABILITY) => {
  // Guard against unapproved database targets or missing capability token
  assertTestCleanupCapability(capability, process.env.DATABASE_URL, 'cleanDatabase');

  try {
    await prisma.auditLog.deleteMany();
    await prisma.orderStatusHistory.deleteMany();
    await prisma.preparationTimeAdjustment.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.category.deleteMany();
    await prisma.stockItem.deleteMany();
    await prisma.dailyOrderSequence.deleteMany();
    await prisma.user.deleteMany();
  } catch (error: any) {
    console.error(`Error during test database cleanup: ${error?.message || error}`);
    throw error;
  }
};

export const createTestUser = async (overrides?: {
  email?: string;
  name?: string;
  password?: string;
  role?: Role;
  isActive?: boolean;
}) => {
  assertSafeTestDatabase(process.env.DATABASE_URL, 'createTestUser');

  const email = overrides?.email || `user_${Date.now()}_${Math.random().toString(36).substring(7)}@test.internal`;
  const name = overrides?.name || 'Test User';
  const password = overrides?.password || 'Password123!';
  const role = overrides?.role || Role.COUNTER;
  const isActive = overrides?.isActive !== undefined ? overrides.isActive : true;

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role,
      isActive
    }
  });

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role as Role,
    tokenVersion: user.tokenVersion
  });

  return { user, token, plainPassword: password };
};
