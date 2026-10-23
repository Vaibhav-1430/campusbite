import { z } from 'zod';

export const verifyOrderSchema = z.object({
  dailyOrderNumber: z
    .string({ required_error: 'Order number is required' })
    .trim()
    .toUpperCase()
    .regex(/^CB-\d+$/, 'Order number format must be CB-101, CB-102, etc.'),
  pin: z
    .string({ required_error: 'Verification PIN is required' })
    .trim()
    .regex(/^\d{4}$/, 'Verification PIN must be exactly 4 digits')
});

export type VerifyOrderInput = z.infer<typeof verifyOrderSchema>;
