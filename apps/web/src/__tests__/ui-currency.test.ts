import { describe, it, expect } from 'vitest';
import { formatPaise, rupeesToPaise, paiseToRupees } from '@campusbite/shared';

describe('Web UI Currency & Calculation Utilities', () => {
  it('should format integer paise accurately to Indian Rupee notation', () => {
    expect(formatPaise(0)).toBe('₹0.00');
    expect(formatPaise(2000)).toBe('₹20.00');
    expect(formatPaise(12550)).toBe('₹125.50');
    expect(formatPaise(100000)).toBe('₹1,000.00');
  });

  it('should convert Rupees to paise avoiding floating point traps', () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
  });

  it('should convert paise to rupees accurately', () => {
    expect(paiseToRupees(1999)).toBe(19.99);
    expect(paiseToRupees(2000)).toBe(20);
  });

  it('should accurately calculate cart totals from line items', () => {
    const cart = [
      { unitPricePaise: 2500, quantity: 2 }, // 5000
      { unitPricePaise: 8000, quantity: 1 }, // 8000
      { unitPricePaise: 1550, quantity: 4 }  // 6200
    ];
    const totalPaise = cart.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0);
    expect(totalPaise).toBe(19200);
    expect(formatPaise(totalPaise)).toBe('₹192.00');
  });
});
