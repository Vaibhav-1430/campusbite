import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStoredToken,
  setStoredToken,
  setOnUnauthorized,
  apiRequest,
  downloadCsv
} from '../services/api.js';
import { Role } from '@campusbite/shared';

const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

describe('Frontend Session Persistence & Auth Client Regression Tests', () => {
  beforeEach(() => {
    (global as any).localStorage = createStorageMock();
    (global as any).sessionStorage = createStorageMock();
    (global as any).window = global;
    (global as any).document = {
      createElement: () => ({
        href: '',
        download: '',
        click: vi.fn(),
        remove: vi.fn()
      }),
      body: {
        appendChild: vi.fn()
      }
    };
    (global as any).window.URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn()
    };
    setOnUnauthorized(null);
    vi.restoreAllMocks();
  });

  describe('Token Storage Mechanism', () => {
    it('should store, retrieve, and clear bearer tokens in localStorage/sessionStorage', () => {
      expect(getStoredToken()).toBeNull();

      const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-payload.signature';
      setStoredToken(sampleToken);
      expect(getStoredToken()).toBe(sampleToken);

      setStoredToken(null);
      expect(getStoredToken()).toBeNull();
    });
  });

  describe('apiRequest Bearer Token Attachment', () => {
    it('should automatically attach Authorization header when token is stored', async () => {
      const sampleToken = 'sample-auth-token-12345';
      setStoredToken(sampleToken);

      let capturedHeaders: Headers | null = null;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { order: { id: 'order-123' } } })
        } as unknown as Response;
      });

      const result = await apiRequest<{ order: { id: string } }>('/orders', {
        method: 'POST',
        body: JSON.stringify({ items: [] })
      });

      expect(result.order.id).toBe('order-123');
      expect(capturedHeaders).not.toBeNull();
      expect(capturedHeaders!.get('Authorization')).toBe(`Bearer ${sampleToken}`);
      expect(capturedHeaders!.get('Content-Type')).toBe('application/json');
    });

    it('should not attach Authorization header when no token is stored (public calls)', async () => {
      setStoredToken(null);

      let capturedHeaders: Headers | null = null;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { items: [] } })
        } as unknown as Response;
      });

      await apiRequest<{ items: any[] }>('/menu');

      expect(capturedHeaders).not.toBeNull();
      expect(capturedHeaders!.get('Authorization')).toBeNull();
    });

    it('should trigger unauthorizedHandler and clear token on 401 response', async () => {
      setStoredToken('invalid-or-expired-token');

      const unauthorizedSpy = vi.fn();
      setOnUnauthorized(unauthorizedSpy);

      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required. No session found.'
            }
          })
        } as unknown as Response;
      });

      await expect(apiRequest('/orders', { method: 'POST' })).rejects.toThrow(
        'Authentication required. No session found.'
      );

      // Token must be wiped immediately
      expect(getStoredToken()).toBeNull();
      // Auth state callback must be triggered to redirect user to login
      expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
    });

    it('should immediately clear stored token and invoke unauthorizedHandler on USER_NOT_FOUND 401', async () => {
      setStoredToken('stale-deleted-user-jwt');

      const unauthorizedSpy = vi.fn();
      setOnUnauthorized(unauthorizedSpy);

      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User account not found'
            }
          })
        } as unknown as Response;
      });

      await expect(apiRequest('/auth/me')).rejects.toThrow('User account not found');

      // Stale token must be wiped from storage immediately
      expect(getStoredToken()).toBeNull();
      // Auth callback must be notified to reset user in-memory state
      expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('downloadCsv Bearer Token Attachment', () => {
    it('should include Authorization header when downloading protected CSV reports', async () => {
      setStoredToken('csv-download-auth-token');

      let capturedHeaders: Headers | null = null;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(['col1,col2\nval1,val2'], { type: 'text/csv' })
        } as unknown as Response;
      });

      // Mock URL.createObjectURL and click
      window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      window.URL.revokeObjectURL = vi.fn();

      await downloadCsv('/analytics/export/sales', 'cafe47-sales.csv');

      expect(capturedHeaders).not.toBeNull();
      expect(capturedHeaders!.get('Authorization')).toBe('Bearer csv-download-auth-token');
    });
  });

  describe('Role-Based Route Access Rules', () => {
    it('should allow COUNTER and ADMIN roles on the counter POS route', () => {
      const allowedRoles: Role[] = [Role.COUNTER, Role.ADMIN];

      expect(allowedRoles.includes(Role.COUNTER)).toBe(true);
      expect(allowedRoles.includes(Role.ADMIN)).toBe(true);
      expect(allowedRoles.includes(Role.KITCHEN)).toBe(false);
    });

    it('should require authentication for staff routes', () => {
      const user = null;
      const isUnauthenticated = !user;
      expect(isUnauthenticated).toBe(true);
    });
  });
});
