import { z } from 'zod';

export const resetBusinessDataSchema = z.object({
  confirmation: z.literal('RESET BUSINESS DATA', {
    errorMap: () => ({ message: 'You must type RESET BUSINESS DATA exactly to proceed.' })
  })
});

export type ResetBusinessDataInput = z.infer<typeof resetBusinessDataSchema>;
