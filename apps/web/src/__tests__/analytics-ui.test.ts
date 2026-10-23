import { describe, it, expect } from 'vitest';
import { escapeCsvField, generateCsv } from '@campusbite/shared';

describe('Phase 6 Analytics UI Helpers & Financial Calculation Rules', () => {
  describe('Financial Display & Paise Formatting', () => {
    const formatRupees = (paise: number) => {
      return (paise / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };

    it('should format paise to INR representation with 2 decimal places', () => {
      expect(formatRupees(15000)).toBe('150.00');
      expect(formatRupees(25050)).toBe('250.50');
      expect(formatRupees(0)).toBe('0.00');
      expect(formatRupees(99)).toBe('0.99');
    });

    it('should calculate Average Order Value (AOV) strictly from completed orders', () => {
      const calculateAov = (completedSalesPaise: number, completedCount: number) => {
        return completedCount > 0 ? Math.round(completedSalesPaise / completedCount) : 0;
      };

      // 2 completed orders with total 25,000 paise -> AOV is 12,500 paise (₹125.00)
      expect(calculateAov(25000, 2)).toBe(12500);

      // 0 completed orders should yield 0 without dividing by zero
      expect(calculateAov(0, 0)).toBe(0);
      expect(calculateAov(50000, 0)).toBe(0);
    });
  });

  describe('Menu Item Cancellation Rate Calculations', () => {
    const computeCancellationRate = (ordered: number, cancelled: number) => {
      return ordered > 0 ? Math.round((cancelled / ordered) * 1000) / 10 : 0;
    };

    it('should calculate accurate cancellation rate percentage', () => {
      expect(computeCancellationRate(10, 2)).toBe(20);
      expect(computeCancellationRate(3, 1)).toBe(33.3);
      expect(computeCancellationRate(5, 0)).toBe(0);
      expect(computeCancellationRate(0, 0)).toBe(0);
    });

    it('should ensure cancelled items do not count towards fulfilled revenue', () => {
      const itemUnitPricePaise = 5000;
      const quantityOrdered = 3;
      const quantityCancelled = 1;
      const quantityFulfilled = quantityOrdered - quantityCancelled;

      const grossPotentialValue = quantityOrdered * itemUnitPricePaise;
      const fulfilledRevenue = quantityFulfilled * itemUnitPricePaise;

      expect(grossPotentialValue).toBe(15000);
      expect(fulfilledRevenue).toBe(10000);
      expect(fulfilledRevenue).not.toBe(grossPotentialValue);
    });
  });

  describe('Kitchen Performance Classification', () => {
    it('should classify order as on-time when prepared within estimate deadline', () => {
      const started = new Date('2026-10-24T10:00:00Z');
      const prepared = new Date('2026-10-24T10:08:00Z'); // 8 mins
      const estimateMins = 10;
      const deadline = new Date(started.getTime() + estimateMins * 60000);

      const isOnTime = prepared.getTime() <= deadline.getTime();
      const actualDuration = (prepared.getTime() - started.getTime()) / 60000;

      expect(isOnTime).toBe(true);
      expect(actualDuration).toBe(8);
    });

    it('should classify order as delayed and measure delay minutes accurately', () => {
      const started = new Date('2026-10-24T10:00:00Z');
      const prepared = new Date('2026-10-24T10:16:00Z'); // 16 mins
      const estimateMins = 10;
      const deadline = new Date(started.getTime() + estimateMins * 60000);

      const isOnTime = prepared.getTime() <= deadline.getTime();
      const delayMinutes = (prepared.getTime() - deadline.getTime()) / 60000;

      expect(isOnTime).toBe(false);
      expect(delayMinutes).toBe(6);
    });
  });

  describe('Date Preset Generation Rules', () => {
    it('should format ISO YYYY-MM-DD date boundaries correctly', () => {
      const date = new Date(Date.UTC(2026, 9, 24)); // October 24, 2026
      const dateStr = date.toISOString().split('T')[0];
      expect(dateStr).toBe('2026-10-24');
    });

    it('should correctly produce 7-day and 30-day window spans', () => {
      const now = new Date('2026-10-24T12:00:00Z');
      const past7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const past30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);

      expect(past7.toISOString().split('T')[0]).toBe('2026-10-18');
      expect(past30.toISOString().split('T')[0]).toBe('2026-09-25');
    });
  });

  describe('CSV Export Escaping & Filename Conventions', () => {
    it('should escape CSV fields with commas, quotes, and newlines', () => {
      expect(escapeCsvField('Classic Burger')).toBe('Classic Burger');
      expect(escapeCsvField('Burger, with Fries')).toBe('"Burger, with Fries"');
      expect(escapeCsvField('Special "Delight"')).toBe('"Special ""Delight"""');
      expect(escapeCsvField('Multi\nLine')).toBe('"Multi\nLine"');
    });

    it('should generate valid RFC 4180 CSV tables', () => {
      const headers = ['Item', 'Quantity', 'Price'];
      const rows = [
        ['Burger, Cheeseburger', 2, '200.00'],
        ['Coffee', 1, '50.00']
      ];

      const csv = generateCsv(headers, rows);
      expect(csv).toContain('Item,Quantity,Price');
      expect(csv).toContain('"Burger, Cheeseburger",2,200.00');
      expect(csv).toContain('Coffee,1,50.00');
    });
  });
});
