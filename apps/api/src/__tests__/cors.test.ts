import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { cleanDatabase } from './test-helper.js';
import { prisma } from '../database/prisma.js';
import { isOriginAllowed, normalizeOrigin } from '../config/cors.js';

const app = createApp();

describe('CORS & Preflight Production Readiness Gate', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  describe('Origin Normalization & Matching Logic', () => {
    it('should normalize origins with trailing slashes and quotes', () => {
      expect(normalizeOrigin('https://campusbite112.netlify.app/')).toBe('https://campusbite112.netlify.app');
      expect(normalizeOrigin('"https://campusbite112.netlify.app/"')).toBe('https://campusbite112.netlify.app');
      expect(normalizeOrigin(" 'https://campusbite112.netlify.app' ")).toBe('https://campusbite112.netlify.app');
    });

    it('should recognize production Netlify origin as permitted', () => {
      expect(isOriginAllowed('https://campusbite112.netlify.app')).toBe(true);
      expect(isOriginAllowed('https://campusbite112.netlify.app/')).toBe(true);
    });

    it('should reject unauthorized arbitrary origins', () => {
      expect(isOriginAllowed('https://malicious-evil-site.com')).toBe(false);
      expect(isOriginAllowed('https://fake-campusbite.com')).toBe(false);
    });

    it('should permit non-browser requests with no origin', () => {
      expect(isOriginAllowed(undefined)).toBe(true);
      expect(isOriginAllowed('')).toBe(true);
    });
  });

  describe('OPTIONS Preflight Handling', () => {
    it('should successfully handle preflight OPTIONS for login without requiring authentication', async () => {
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'https://campusbite112.netlify.app')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization, X-Requested-With');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('https://campusbite112.netlify.app');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
      expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    });

    it('should handle preflight OPTIONS for deep API routes', async () => {
      const res = await request(app)
        .options('/api/v1/orders')
        .set('Origin', 'https://campusbite112.netlify.app')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('https://campusbite112.netlify.app');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should not return Access-Control-Allow-Origin for preflight from unapproved origins', async () => {
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'https://malicious-attacker.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Actual Request Headers & Credential Preservation', () => {
    it('should include CORS allow headers on POST /api/v1/auth/login from Netlify frontend', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://campusbite112.netlify.app')
        .set('Content-Type', 'application/json')
        .send({
          email: 'nonexistent@campusbite.college',
          password: 'Password123!'
        });

      // Whether invalid credentials (401) or validation error (400),
      // CORS headers MUST be present so the browser receives the error response!
      expect(res.headers['access-control-allow-origin']).toBe('https://campusbite112.netlify.app');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should include CORS allow headers on GET requests from Netlify frontend', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://campusbite112.netlify.app');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://campusbite112.netlify.app');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('should block state-changing POST from unapproved origin via CSRF protection', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://malicious-attacker.com')
        .set('Content-Type', 'application/json')
        .send({
          email: 'admin@campusbite.college',
          password: 'Password123!'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CSRF_BLOCKED');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
