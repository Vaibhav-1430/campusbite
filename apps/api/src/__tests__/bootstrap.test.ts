import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cleanDatabase } from './test-helper.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';
import { prisma } from '../database/prisma.js';
import { Role } from '@campusbite/shared';

describe('Admin Bootstrap Script', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('should create root administrator when none exists', async () => {
    const admin = await bootstrapAdmin();

    expect(admin).toBeDefined();
    expect(admin?.role).toBe(Role.ADMIN);
    expect(admin?.isActive).toBe(true);

    const dbUser = await prisma.user.findUnique({
      where: { id: admin!.id }
    });
    expect(dbUser).toBeDefined();
    expect(dbUser?.email).toBe(admin?.email);
  });

  it('should be idempotent and not create duplicate admin if one already exists', async () => {
    const adminCountBefore = await prisma.user.count({ where: { role: Role.ADMIN } });
    expect(adminCountBefore).toBe(1);

    const result = await bootstrapAdmin();
    expect(result).toBeDefined();

    const adminCountAfter = await prisma.user.count({ where: { role: Role.ADMIN } });
    expect(adminCountAfter).toBe(1);
  });
});
