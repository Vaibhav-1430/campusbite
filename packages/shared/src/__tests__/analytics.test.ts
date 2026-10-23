import { describe, it, expect } from 'vitest';
import {
  analyticsDateRangeSchema,
  dailyClosingReportQuerySchema,
  escapeCsvField,
  generateCsv
} from '../index.js';

describe('Analytics Schemas and CSV Utilities in @campusbite/shared', () => {
  describe('analyticsDateRangeSchema', () => {
    it('should validate valid date ranges (YYYY-MM-DD)', () => {
      const result = analyticsDateRangeSchema.safeParse({
        startDate: '2026-10-01',
        endDate: '2026-10-24'
      });
      expect(result.success).toBe(true);
    });

    it('should allow single-day range where startDate equals endDate', () => {
      const result = analyticsDateRangeSchema.safeParse({
        startDate: '2026-10-24',
        endDate: '2026-10-24'
      });
      expect(result.success).toBe(true);
    });

    it('should reject when startDate is after endDate', () => {
      const result = analyticsDateRangeSchema.safeParse({
        startDate: '2026-10-25',
        endDate: '2026-10-24'
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain('Start date cannot be after end date');
      }
    });

    it('should reject invalid date formats', () => {
      expect(analyticsDateRangeSchema.safeParse({ startDate: '24-10-2026', endDate: '2026-10-24' }).success).toBe(false);
      expect(analyticsDateRangeSchema.safeParse({ startDate: '2026/10/01', endDate: '2026/10/24' }).success).toBe(false);
      expect(analyticsDateRangeSchema.safeParse({ startDate: 'invalid', endDate: '2026-10-24' }).success).toBe(false);
    });
  });

  describe('dailyClosingReportQuerySchema', () => {
    it('should accept valid YYYY-MM-DD or undefined', () => {
      expect(dailyClosingReportQuerySchema.safeParse({ date: '2026-10-23' }).success).toBe(true);
      expect(dailyClosingReportQuerySchema.safeParse({}).success).toBe(true);
    });

    it('should reject malformed date input', () => {
      expect(dailyClosingReportQuerySchema.safeParse({ date: '10-23-2026' }).success).toBe(false);
    });
  });

  describe('RFC 4180 CSV Generation', () => {
    it('should escape simple values without quoting', () => {
      expect(escapeCsvField('hello')).toBe('hello');
      expect(escapeCsvField(123)).toBe('123');
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
    });

    it('should wrap fields containing commas in double quotes', () => {
      expect(escapeCsvField('Tea, Hot')).toBe('"Tea, Hot"');
    });

    it('should wrap fields containing newlines', () => {
      expect(escapeCsvField("Line 1\nLine 2")).toBe("\"Line 1\nLine 2\"");
    });

    it('should escape internal double quotes by doubling them', () => {
      expect(escapeCsvField('Chef\'s "Special" Dish')).toBe('"Chef\'s ""Special"" Dish"');
    });

    it('should generate valid full CSV text', () => {
      const headers = ['Item Name', 'Quantity', 'Revenue'];
      const rows = [
        ['Burger, Veg', 10, '₹800.00'],
        ['"Special" Coffee', 5, '₹450.00']
      ];

      const csv = generateCsv(headers, rows);
      expect(csv).toBe(
        'Item Name,Quantity,Revenue\r\n"Burger, Veg",10,₹800.00\r\n"""Special"" Coffee",5,₹450.00'
      );
    });
  });
});
