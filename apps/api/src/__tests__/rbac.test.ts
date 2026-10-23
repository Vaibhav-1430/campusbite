import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Role } from '@campusbite/shared';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { prisma } from '../database/prisma.js';

const app = createApp();

describe('Role-Based Access Control (RBAC)', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('should allow ADMIN to access user management endpoints', async () => {
    const { token } = await createTestUser({ role: Role.ADMIN });

    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should deny COUNTER staff access to user management endpoints with 403', async () => {
    const { token } = await createTestUser({ role: Role.COUNTER });

    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('should deny KITCHEN staff access to user management endpoints with 403', async () => {
    const { token } = await createTestUser({ role: Role.KITCHEN });

    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('should deny unauthenticated requests to protected endpoints with 401', async () => {
    const response = await request(app).get('/api/v1/users');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
