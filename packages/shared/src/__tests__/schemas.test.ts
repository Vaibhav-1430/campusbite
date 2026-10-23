import { describe, it, expect } from 'vitest';
import { loginSchema, resetPasswordSchema } from '../schemas/auth.schemas.js';
import { createUserSchema, updateUserStatusSchema } from '../schemas/user.schemas.js';
import { Role } from '../constants/roles.js';

describe('Shared Validation Schemas', () => {
  describe('loginSchema', () => {
    it('should validate and normalize valid login input', () => {
      const result = loginSchema.safeParse({
        email: '  Admin@CampusBite.com ',
        password: 'Password123'
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('admin@campusbite.com');
      }
    });

    it('should reject invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'Password123'
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const result = loginSchema.safeParse({
        email: 'admin@campusbite.com',
        password: ''
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createUserSchema', () => {
    it('should accept valid user input for all roles', () => {
      for (const role of [Role.ADMIN, Role.COUNTER, Role.KITCHEN]) {
        const result = createUserSchema.safeParse({
          name: 'Jane Doe',
          email: `${role.toLowerCase()}@test.internal`,
          password: 'Password123!',
          role
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject weak password (missing number or uppercase)', () => {
      const result = createUserSchema.safeParse({
        name: 'Jane Doe',
        email: 'jane@test.internal',
        password: 'weakpassword',
        role: Role.COUNTER
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid role', () => {
      const result = createUserSchema.safeParse({
        name: 'Jane Doe',
        email: 'jane@test.internal',
        password: 'Password123!',
        role: 'SUPERADMIN'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateUserStatusSchema', () => {
    it('should accept boolean isActive', () => {
      expect(updateUserStatusSchema.safeParse({ isActive: true }).success).toBe(true);
      expect(updateUserStatusSchema.safeParse({ isActive: false }).success).toBe(true);
      expect(updateUserStatusSchema.safeParse({ isActive: 'yes' }).success).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    it('should require strong password', () => {
      expect(resetPasswordSchema.safeParse({ newPassword: 'ValidPassword1' }).success).toBe(true);
      expect(resetPasswordSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
      expect(resetPasswordSchema.safeParse({ newPassword: 'alllowercase1' }).success).toBe(false);
    });
  });
});
