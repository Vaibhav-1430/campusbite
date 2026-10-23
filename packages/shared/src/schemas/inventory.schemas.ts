import { z } from 'zod';

export const createStockItemSchema = z.object({
  name: z
    .string({ required_error: 'Stock item name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(150, 'Name cannot exceed 150 characters'),
  unit: z
    .string({ required_error: 'Unit of measure is required' })
    .trim()
    .min(1, 'Unit must be at least 1 character')
    .max(50, 'Unit cannot exceed 50 characters')
    .default('portions'),
  currentQuantity: z
    .number({ required_error: 'Current quantity is required' })
    .int('Quantity must be an integer')
    .min(0, 'Current quantity cannot be negative')
    .default(0),
  lowStockThreshold: z
    .number({ required_error: 'Low stock threshold is required' })
    .int('Threshold must be an integer')
    .min(0, 'Threshold cannot be negative')
    .default(10)
});

export type CreateStockItemInput = z.infer<typeof createStockItemSchema>;

export const updateStockItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(150, 'Name cannot exceed 150 characters')
    .optional(),
  unit: z
    .string()
    .trim()
    .min(1, 'Unit must be at least 1 character')
    .max(50, 'Unit cannot exceed 50 characters')
    .optional(),
  lowStockThreshold: z
    .number()
    .int('Threshold must be an integer')
    .min(0, 'Threshold cannot be negative')
    .optional()
});

export type UpdateStockItemInput = z.infer<typeof updateStockItemSchema>;

export const restockStockItemSchema = z.object({
  quantityAdded: z
    .number({ required_error: 'Restock quantity is required' })
    .int('Quantity must be an integer')
    .min(1, 'Restock quantity must be at least 1')
    .max(100000, 'Restock quantity cannot exceed 100,000'),
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional().nullable()
});

export type RestockStockItemInput = z.infer<typeof restockStockItemSchema>;

export const adjustStockItemSchema = z.object({
  quantityChange: z
    .number({ required_error: 'Quantity change is required' })
    .int('Quantity change must be an integer')
    .refine((val) => val !== 0, 'Quantity change cannot be zero'),
  reason: z
    .string({ required_error: 'Reason for adjustment is mandatory' })
    .trim()
    .min(3, 'Reason must be at least 3 characters')
    .max(500, 'Reason cannot exceed 500 characters')
});

export type AdjustStockItemInput = z.infer<typeof adjustStockItemSchema>;
