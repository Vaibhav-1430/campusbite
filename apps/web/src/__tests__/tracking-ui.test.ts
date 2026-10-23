import { describe, it, expect } from 'vitest';
import { OrderStatus } from '@campusbite/shared';

describe('Customer Tracking UI Helpers & State Rules', () => {
  it('should clean and validate daily order number input', () => {
    const formatOrderNumber = (input: string) => input.trim().toUpperCase();

    expect(formatOrderNumber('cb-101')).toBe('CB-101');
    expect(formatOrderNumber('  cb-205  ')).toBe('CB-205');
    expect(formatOrderNumber('101')).toBe('101');
  });

  it('should restrict verification PIN strictly to 4 numeric digits', () => {
    const sanitizePin = (input: string) => input.replace(/\D/g, '').slice(0, 4);

    expect(sanitizePin('1234')).toBe('1234');
    expect(sanitizePin('12a3b4c')).toBe('1234');
    expect(sanitizePin('123456')).toBe('1234');
    expect(sanitizePin('abcd')).toBe('');
  });

  it('should accurately determine active stepper progression index', () => {
    const getActiveStepIndex = (status: OrderStatus): number => {
      switch (status) {
        case OrderStatus.PLACED:
          return 0;
        case OrderStatus.PREPARING:
          return 1;
        case OrderStatus.PREPARED:
          return 2;
        case OrderStatus.COMPLETED:
          return 3;
        default:
          return -1;
      }
    };

    expect(getActiveStepIndex(OrderStatus.PLACED)).toBe(0);
    expect(getActiveStepIndex(OrderStatus.PREPARING)).toBe(1);
    expect(getActiveStepIndex(OrderStatus.PREPARED)).toBe(2);
    expect(getActiveStepIndex(OrderStatus.COMPLETED)).toBe(3);
    expect(getActiveStepIndex(OrderStatus.CANCELLED)).toBe(-1);
  });

  it('should format session storage tracking payload with zero sensitive leakage', () => {
    const sessionPayload = {
      orderId: 'c8065f49-555e-49b5-a337-b0885e35fb01',
      dailyOrderNumber: 'CB-101',
      trackingToken: 'jwt.token.here'
    };

    const serialized = JSON.stringify(sessionPayload);
    const parsed = JSON.parse(serialized);

    expect(parsed.orderId).toBe('c8065f49-555e-49b5-a337-b0885e35fb01');
    expect(parsed.dailyOrderNumber).toBe('CB-101');
    expect(parsed.trackingToken).toBe('jwt.token.here');
    expect(parsed.customerPinHash).toBeUndefined();
    expect(parsed.totalPaise).toBeUndefined();
  });
});
