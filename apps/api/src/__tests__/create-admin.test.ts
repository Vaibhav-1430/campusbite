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
