import { z } from 'zod';
import { Role } from '../constants/roles.js';

export const createUserSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password must be under 100 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum([Role.ADMIN, Role.COUNTER, Role.KITCHEN], {
    required_error: 'Role is required'
  })
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive flag is required' })
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
