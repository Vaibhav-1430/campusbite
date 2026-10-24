import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cleanDatabase } from './test-helper.js';
import { createAdminAccount } from '../scripts/create-admin.js';
import { login } from '../modules/auth/auth.service.js';
import { prisma } from '../database/prisma.js';
import { Role } from '@campusbite/shared';

describe('Admin Creation Script (create-admin)', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('should safely create a new administrator account when email does not exist', async () => {
    const result = await createAdminAccount({
      email: 'owner@campusbite.internal',
      name: 'Campus Owner',
      password: 'Adminhumai47'
    });

    expect(result.status).toBe('CREATED');
    expect(result.user).toBeDefined();
    expect(result.user?.email).toBe('owner@campusbite.internal');
    expect(result.user?.role).toBe(Role.ADMIN);
    expect(result.user?.isActive).toBe(true);

    // Verify in database directly
    const dbUser = await prisma.user.findUnique({
      where: { email: 'owner@campusbite.internal' }
    });
    expect(dbUser).toBeDefined();
    expect(dbUser?.role).toBe(Role.ADMIN);
    expect(dbUser?.passwordHash).toBeDefined();
    expect(dbUser?.passwordHash).not.toBe('Adminhumai47'); // Must be hashed with bcrypt
    expect(dbUser?.passwordHash.startsWith('$2')).toBe(true);
  });

  it('should allow the newly created administrator to log in via the authentication service', async () => {
    const authResult = await login({
      email: 'owner@campusbite.internal',
      password: 'Adminhumai47'
    });

    expect(authResult.token).toBeDefined();
    expect(authResult.user.email).toBe('owner@campusbite.internal');
    expect(authResult.user.role).toBe(Role.ADMIN);
  });

  it('should detect duplicate email and prevent creation or modification of existing account', async () => {
    // Attempt to create again with same email
    const duplicateResult = await createAdminAccount({
      email: 'owner@campusbite.internal',
      name: 'Intruder Name',
      password: 'DifferentPassword123!'
    });

    expect(duplicateResult.status).toBe('ALREADY_EXISTS');
    expect(duplicateResult.message).toContain('already exists');

    // Confirm existing user in database was NOT altered
    const dbUser = await prisma.user.findUnique({
      where: { email: 'owner@campusbite.internal' }
    });
    expect(dbUser?.name).toBe('Campus Owner'); // Name was preserved

    // Confirm original password still works (hash was not overwritten)
    const loginOriginal = await login({
      email: 'owner@campusbite.internal',
      password: 'Adminhumai47'
    });
    expect(loginOriginal.token).toBeDefined();
  });

  it('should support alternative email if requested (e.g. cafe47@gmail.com)', async () => {
    const altResult = await createAdminAccount({
      email: 'cafe47@gmail.com',
      name: 'Cafe Owner',
      password: 'Adminhumai47'
    });

    expect(altResult.status).toBe('CREATED');
    expect(altResult.user?.email).toBe('cafe47@gmail.com');
    expect(altResult.user?.role).toBe(Role.ADMIN);

    const loginAlt = await login({
      email: 'cafe47@gmail.com',
      password: 'Adminhumai47'
    });
    expect(loginAlt.token).toBeDefined();
  });

  it('should support creating cafe47@campusbite.internal with password Adminhumai47', async () => {
    const cafeResult = await createAdminAccount({
      email: 'cafe47@campusbite.internal',
      name: 'Cafe Owner',
      password: 'Adminhumai47'
    });

    expect(cafeResult.status).toBe('CREATED');
    expect(cafeResult.user?.email).toBe('cafe47@campusbite.internal');
    expect(cafeResult.user?.role).toBe(Role.ADMIN);

    const loginRes = await login({
      email: 'cafe47@campusbite.internal',
      password: 'Adminhumai47'
    });
    expect(loginRes.token).toBeDefined();
    expect(loginRes.user.email).toBe('cafe47@campusbite.internal');
    expect(loginRes.user.role).toBe(Role.ADMIN);
  });

  it('should remove all other admins while strictly preserving staff accounts when removeOtherAdmins is true', async () => {
    // 1. Create a staff counter user and kitchen user
    const counterUser = await prisma.user.create({
      data: {
        email: 'staff.counter@campusbite.internal',
        name: 'Counter Staff',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
        role: Role.COUNTER,
        isActive: true
      }
    });

    const kitchenUser = await prisma.user.create({
      data: {
        email: 'staff.kitchen@campusbite.internal',
        name: 'Kitchen Staff',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
        role: Role.KITCHEN,
        isActive: true
      }
    });

    // 2. Ensure an old admin exists
    const oldAdmin = await prisma.user.findFirst({
      where: { role: Role.ADMIN, email: { not: 'cafe47@campusbite.internal' } }
    });
    expect(oldAdmin).toBeDefined();

    // 3. Run createAdminAccount for cafe47 with removeOtherAdmins: true
    const result = await createAdminAccount({
      email: 'cafe47@campusbite.internal',
      removeOtherAdmins: true
    });

    expect(result.removedOtherAdminsCount).toBeGreaterThan(0);

    // 4. Verify in DB: cafe47 is the ONLY admin
    const remainingAdmins = await prisma.user.findMany({
      where: { role: Role.ADMIN }
    });
    expect(remainingAdmins.length).toBe(1);
    expect(remainingAdmins[0].email).toBe('cafe47@campusbite.internal');

    // 5. Verify staff accounts are COMPLETELY UNTOUCHED
    const dbCounter = await prisma.user.findUnique({
      where: { id: counterUser.id }
    });
    expect(dbCounter).toBeDefined();
    expect(dbCounter?.role).toBe(Role.COUNTER);
    expect(dbCounter?.email).toBe('staff.counter@campusbite.internal');

    const dbKitchen = await prisma.user.findUnique({
      where: { id: kitchenUser.id }
    });
    expect(dbKitchen).toBeDefined();
    expect(dbKitchen?.role).toBe(Role.KITCHEN);
    expect(dbKitchen?.email).toBe('staff.kitchen@campusbite.internal');
  });

  it('should reject invalid email formats', async () => {
    await expect(
      createAdminAccount({
        email: 'invalid-email-format',
        password: 'Adminhumai47'
      })
    ).rejects.toThrow('Invalid email address format');
  });

  it('should reject weak passwords', async () => {
    await expect(
      createAdminAccount({
        email: 'weakpass@campusbite.internal',
        password: '123'
      })
    ).rejects.toThrow('at least 8 characters');
  });
});
