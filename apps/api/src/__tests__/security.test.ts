import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { Role } from '@campusbite/shared';
import { prisma } from '../database/prisma.js';

const app = createApp();

describe('API Security & CSRF Defense Gate', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('should block state-changing requests from unapproved external origins with 403 CSRF_BLOCKED', async () => {
    const { token: adminToken } = await createTestUser({ role: Role.ADMIN });

    const response = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Origin', 'https://attacker-malicious-site.com')
      .send({
        name: 'Attacker Attempt',
        email: 'attacker@evil.com',
        password: 'Password123!',
        role: Role.COUNTER
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(['CORS_NOT_ALLOWED', 'CSRF_BLOCKED']).toContain(response.body.error.code);
  });

  it('should allow state-changing requests from allowlisted origins', async () => {
    const { token: adminToken } = await createTestUser({ role: Role.ADMIN });

    const response = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Origin', 'http://localhost:5173')
      .send({
        name: 'Valid Origin User',
        email: 'valid.origin@campusbite.internal',
        password: 'Password123!',
        role: Role.COUNTER
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('should permit standard GET requests from browsers', async () => {
    const { token: adminToken } = await createTestUser({ role: Role.ADMIN });

    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should include Helmet security headers in all HTTP responses', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should never expose password hashes or sensitive fields in user endpoints', async () => {
    const { token: adminToken } = await createTestUser({ role: Role.ADMIN });

    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const users = response.body.data.users;
    expect(users.length).toBeGreaterThan(0);

    for (const u of users) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.password).toBeUndefined();
      expect(u.tokenVersion).toBeUndefined();
    }
  });
});
