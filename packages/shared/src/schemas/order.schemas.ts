import { z } from 'zod';

export const createOrderItemSchema = z.object({
  menuItemId: z.string({ required_error: 'Menu Item ID is required' }).uuid('Invalid Menu Item ID'),
  quantity: z
    .number({ required_error: 'Quantity is required' })
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be at least 1')
    .max(99, 'Quantity cannot exceed 99 portions'),
  notes: z.string().trim().max(255).optional().nullable()
});

export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;

export const createOrderSchema = z.object({
  idempotencyKey: z
    .string({ required_error: 'Idempotency key is required' })
    .uuid('Idempotency key must be a valid UUID'),
  items: z
    .array(createOrderItemSchema)
    .min(1, 'Order must contain at least one item'),
  assignedToId: z.string().uuid('Invalid staff ID').optional().nullable()
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z
    .string({ required_error: 'Cancellation reason is required' })
    .trim()
    .min(3, 'Reason must be at least 3 characters')
    .max(500, 'Reason cannot exceed 500 characters')
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const adjustPrepTimeSchema = z.object({
  minutesAdded: z
    .number({ required_error: 'Minutes added is required' })
    .int('Minutes added must be an integer')
    .min(1, 'Minutes added must be at least 1 minute')
    .max(120, 'Cannot add more than 120 minutes at once'),
  reason: z.string().trim().max(255).optional().nullable()
});

export type AdjustPrepTimeInput = z.infer<typeof adjustPrepTimeSchema>;

export const assignOrderSchema = z.object({
  staffId: z.string({ required_error: 'Staff ID is required' }).uuid('Invalid Staff ID')
});

export type AssignOrderInput = z.infer<typeof assignOrderSchema>;

