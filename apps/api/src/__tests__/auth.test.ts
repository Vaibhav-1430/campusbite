import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Role } from '@campusbite/shared';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { prisma } from '../database/prisma.js';
import { generateToken, COOKIE_NAME } from '../utils/token.js';

const app = createApp();

describe('Auth API (/api/v1/auth)', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should successfully authenticate user with valid credentials', async () => {
      const { user, plainPassword } = await createTestUser({
        email: 'counter@campusbite.internal',
        role: Role.COUNTER
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'counter@campusbite.internal',
          password: plainPassword
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(user.email);
      expect(response.body.data.user.role).toBe(Role.COUNTER);
      expect(response.body.data.token).toBeDefined();

      // Verify Set-Cookie header
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('campusbite_session');
    });

    it('should reject login with incorrect password', async () => {
      await createTestUser({
        email: 'kitchen@campusbite.internal',
        role: Role.KITCHEN
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'kitchen@campusbite.internal',
          password: 'WrongPassword999!'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for non-existent email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ghost@campusbite.internal',
          password: 'Password123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login if staff account is deactivated', async () => {
      const { plainPassword } = await createTestUser({
        email: 'inactive@campusbite.internal',
        isActive: false
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'inactive@campusbite.internal',
          password: plainPassword
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user session when valid Bearer token provided', async () => {
      const { user, token } = await createTestUser({ role: Role.ADMIN });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(user.id);
      expect(response.body.data.user.role).toBe(Role.ADMIN);
    });

    it('should return user session when valid cookie provided', async () => {
      const { user, token } = await createTestUser({ role: Role.COUNTER });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`campusbite_session=${token}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(user.id);
    });

    it('should prioritize valid Bearer token over a stale cookie', async () => {
      const { user, token: validBearerToken } = await createTestUser({ role: Role.ADMIN });
      const staleCookieToken = generateToken({
        userId: '00000000-0000-0000-0000-000000000000',
        email: 'ghost.user@campusbite.internal',
        role: Role.COUNTER,
        tokenVersion: 1
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${validBearerToken}`)
        .set('Cookie', [`${COOKIE_NAME}=${staleCookieToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(user.id);
      expect(response.body.data.user.role).toBe(Role.ADMIN);
    });

    it('should reject invalid explicitly supplied Bearer token without falling back to cookie', async () => {
      const { token: validCookieToken } = await createTestUser({ role: Role.COUNTER });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-corrupted-token-12345')
        .set('Cookie', [`${COOKIE_NAME}=${validCookieToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should return 401 USER_NOT_FOUND when user ID does not exist in database', async () => {
      const deletedUserToken = generateToken({
        userId: '11111111-2222-3333-4444-555555555555',
        email: 'deleted@campusbite.internal',
        role: Role.ADMIN,
        tokenVersion: 1
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${deletedUserToken}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should clear stale session cookie on USER_NOT_FOUND', async () => {
      const deletedUserToken = generateToken({
        userId: '22222222-3333-4444-5555-666666666666',
        email: 'deleted.cookie@campusbite.internal',
        role: Role.ADMIN,
        tokenVersion: 1
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`${COOKIE_NAME}=${deletedUserToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');

      const setCookies = response.headers['set-cookie'];
      expect(setCookies).toBeDefined();
      expect(setCookies[0]).toContain(`${COOKIE_NAME}=;`);
    });

    it('should return 401 when no token or cookie provided', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should clear session cookie on revoked token version', async () => {
      const { user } = await createTestUser({ role: Role.COUNTER });
      const revokedToken = generateToken({
        userId: user.id,
        email: user.email,
        role: Role.COUNTER,
        tokenVersion: 999 // Mismatch from DB tokenVersion: 1
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`${COOKIE_NAME}=${revokedToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('SESSION_REVOKED');
      const setCookies = response.headers['set-cookie'];
      expect(setCookies).toBeDefined();
      expect(setCookies[0]).toContain(`${COOKIE_NAME}=;`);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should clear session cookie and record audit log on valid logout', async () => {
      const { user, token } = await createTestUser({ role: Role.ADMIN });

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const cookies = response.headers['set-cookie'];
      expect(cookies[0]).toContain('campusbite_session=;');

      // Verify audit log entry
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          action: 'USER_LOGOUT',
          actorId: user.id
        }
      });
      expect(auditEntry).toBeDefined();
      expect(auditEntry?.actorRole).toBe(Role.ADMIN);
    });

    it('should clear stale session cookie on logout even when account does not exist without requiring authentication', async () => {
      const deletedUserToken = generateToken({
        userId: '33333333-4444-5555-6666-777777777777',
        email: 'missing@campusbite.internal',
        role: Role.COUNTER,
        tokenVersion: 1
      });

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [`${COOKIE_NAME}=${deletedUserToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain(`${COOKIE_NAME}=;`);
    });

    it('should return 200 and clear cookie even when called unauthenticated', async () => {
      const response = await request(app).post('/api/v1/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const cookies = response.headers['set-cookie'];
      expect(cookies[0]).toContain(`${COOKIE_NAME}=;`);
    });
  });
});
