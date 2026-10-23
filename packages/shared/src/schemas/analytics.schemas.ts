import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const analyticsDateRangeSchema = z
  .object({
    startDate: z
      .string({ required_error: 'Start date is required' })
      .trim()
      .regex(dateRegex, 'Start date must be in YYYY-MM-DD format'),
    endDate: z
      .string({ required_error: 'End date is required' })
      .trim()
      .regex(dateRegex, 'End date must be in YYYY-MM-DD format')
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'Start date cannot be after end date',
    path: ['startDate']
  });

export type AnalyticsDateRangeInput = z.infer<typeof analyticsDateRangeSchema>;

export const dailyClosingReportQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(dateRegex, 'Date must be in YYYY-MM-DD format')
    .optional()
});

export type DailyClosingReportQueryInput = z.infer<typeof dailyClosingReportQuerySchema>;
