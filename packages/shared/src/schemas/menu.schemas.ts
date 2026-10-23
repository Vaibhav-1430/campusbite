import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z
    .string({ required_error: 'Category name is required' })
    .trim()
    .min(2, 'Category name must be at least 2 characters')
    .max(100, 'Category name cannot exceed 100 characters'),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createMenuItemSchema = z.object({
  categoryId: z.string({ required_error: 'Category ID is required' }).uuid('Invalid Category ID'),
  name: z
    .string({ required_error: 'Item name is required' })
    .trim()
    .min(2, 'Item name must be at least 2 characters')
    .max(150, 'Item name cannot exceed 150 characters'),
  description: z.string().trim().max(1000).optional().nullable(),
  pricePaise: z
    .number({ required_error: 'Price in paise is required' })
    .int('Price must be an integer')
    .min(0, 'Price cannot be negative'),
  prepTimeMinutes: z
    .number({ required_error: 'Preparation time in minutes is required' })
    .int('Preparation time must be an integer')
    .min(1, 'Preparation time must be at least 1 minute')
    .max(180, 'Preparation time cannot exceed 180 minutes')
    .default(10),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  isAvailable: z.boolean().default(true),
  stockItemId: z.string().uuid('Invalid Stock Item ID').optional().nullable()
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;

export const updateMenuItemSchema = createMenuItemSchema.partial();
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

export const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean({ required_error: 'isAvailable flag is required' })
});

export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
