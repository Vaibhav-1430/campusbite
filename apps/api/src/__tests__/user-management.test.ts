import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Role } from '@campusbite/shared';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { prisma } from '../database/prisma.js';

const app = createApp();

describe('User Management API (/api/v1/users)', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('should allow ADMIN to create new staff accounts', async () => {
    const { token: adminToken } = await createTestUser({ role: Role.ADMIN });

    const response = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Chef Anita',
        email: 'chef.anita@campusbite.internal',
        password: 'Password123!',
        role: Role.KITCHEN
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('chef.anita@campusbite.internal');
    expect(response.body.data.user.role).toBe(Role.KITCHEN);
    expect(response.body.data.user.isActive).toBe(true);
  });

  it('should prevent duplicate staff email creation with 409 Conflict', async () => {
    const { token: adminToken } = await createTestUser({ role: Role.ADMIN });

    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Worker 1',
        email: 'worker@campusbite.internal',
        password: 'Password123!',
        role: Role.COUNTER
      });

    const duplicateResponse = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Worker 2',
        email: 'worker@campusbite.internal',
        password: 'Password123!',
        role: Role.COUNTER
      });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.success).toBe(false);
    expect(duplicateResponse.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('should allow ADMIN to deactivate a staff account and revoke active session', async () => {
    const { token: adminToken } = await createTestUser({ role: Role.ADMIN });
    const { user: staffUser, token: staffToken, plainPassword } = await createTestUser({ role: Role.COUNTER });

    // Verify staff user initially works
    const checkInitial = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(checkInitial.status).toBe(200);

    // Admin deactivates staff account
    const deactivateResponse = await request(app)
      .patch(`/api/v1/users/${staffUser.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(deactivateResponse.status).toBe(200);
    expect(deactivateResponse.body.data.user.isActive).toBe(false);

    // Subsequent API call with staff token MUST be rejected with 403 / 401
    const checkAfter = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(checkAfter.status).toBe(403);
    expect(checkAfter.body.error.code).toBe('ACCOUNT_DEACTIVATED');

    // Attempt to log in with credentials should now fail
    const loginAttempt = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: staffUser.email,
        password: plainPassword
      });
    expect(loginAttempt.status).toBe(403);
    expect(loginAttempt.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('should prevent ADMIN from deactivating their own account', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser({ role: Role.ADMIN });

    const response = await request(app)
      .patch(`/api/v1/users/${adminUser.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('CANNOT_SELF_DEACTIVATE');
  });

  it('should allow password reset and invalidate existing sessions immediately', async () => {
    const { token: adminToken } = await createTestUser({ role: Role.ADMIN });
    const { user: targetUser, token: oldToken } = await createTestUser({ role: Role.KITCHEN });

    // Reset password
    const resetResponse = await request(app)
      .post(`/api/v1/users/${targetUser.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'NewSecurePassword123!' });

    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.success).toBe(true);

    // Old token should now be rejected as SESSION_REVOKED
    const checkOldToken = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);

    expect(checkOldToken.status).toBe(401);
    expect(checkOldToken.body.error.code).toBe('SESSION_REVOKED');

    // New password should work
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: targetUser.email,
        password: 'NewSecurePassword123!'
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
  });
});
