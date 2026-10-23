import { Role } from '@campusbite/shared';
import { prisma } from '../database/prisma.js';
import { hashPassword } from '../utils/password.js';
import { generateToken } from '../utils/token.js';

export const cleanDatabase = async () => {
  await prisma.auditLog.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.preparationTimeAdjustment.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.stockItem.deleteMany();
  await prisma.user.deleteMany();
};

export const createTestUser = async (overrides?: {
  email?: string;
  name?: string;
  password?: string;
  role?: Role;
  isActive?: boolean;
}) => {
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
