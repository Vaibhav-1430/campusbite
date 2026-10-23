import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Role } from '@campusbite/shared';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { prisma } from '../database/prisma.js';

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

    it('should return 401 when no token or cookie provided', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should clear session cookie on logout', async () => {
      const { token } = await createTestUser({ role: Role.ADMIN });

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const cookies = response.headers['set-cookie'];
      expect(cookies[0]).toContain('campusbite_session=;');
    });
  });
});
