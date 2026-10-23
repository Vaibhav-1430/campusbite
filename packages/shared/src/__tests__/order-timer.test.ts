import { describe, it, expect } from 'vitest';
import { calculateOrderTimer } from '../utils/order-timer.js';
import { adjustPrepTimeSchema, assignOrderSchema } from '../schemas/order.schemas.js';
import { OrderStatus } from '../constants/order-status.js';
import { OrderDto } from '../types/order.types.js';

describe('Order Timer & KDS Schemas', () => {
  const baseOrder: OrderDto = {
    id: 'ord-123',
    dailyOrderNumber: 'CB-101',
    orderDate: '2026-10-24',
    idempotencyKey: 'c8065f49-555e-49b5-a337-b0885e35fb01',
    status: OrderStatus.PLACED,
    totalPaise: 7500,
    initialEstimatedMinutes: 10,
    preparationStartedAt: null,
    estimatedCompletionAt: null,
    preparedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdById: 'user-counter-1',
    assignedToId: null,
    createdAt: new Date('2026-10-24T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-10-24T10:00:00Z').toISOString(),
    items: [],
    prepAdjustments: []
  };

  it('should not start countdown for PLACED orders', () => {
    const timer = calculateOrderTimer(baseOrder);
    expect(timer.isPlaced).toBe(true);
    expect(timer.isPreparing).toBe(false);
    expect(timer.elapsedSeconds).toBe(0);
    expect(timer.remainingSeconds).toBe(600); // 10 minutes * 60
    expect(timer.isOverdue).toBe(false);
    expect(timer.formattedRemaining).toBe('10m est.');
  });

  it('should calculate elapsed and remaining time accurately for PREPARING orders', () => {
    const startedAt = new Date('2026-10-24T10:05:00Z');
    const estimatedCompletion = new Date('2026-10-24T10:15:00Z'); // 10 min prep

    const preparingOrder: OrderDto = {
      ...baseOrder,
      status: OrderStatus.PREPARING,
      preparationStartedAt: startedAt.toISOString(),
      estimatedCompletionAt: estimatedCompletion.toISOString()
    };

    // 4 minutes in (10:09:00Z)
    const nowMs = new Date('2026-10-24T10:09:00Z').getTime();
    const timer = calculateOrderTimer(preparingOrder, nowMs);

    expect(timer.isPreparing).toBe(true);
    expect(timer.elapsedSeconds).toBe(240); // 4 minutes = 240s
    expect(timer.remainingSeconds).toBe(360); // 6 minutes remaining = 360s
    expect(timer.isOverdue).toBe(false);
    expect(timer.formattedElapsed).toBe('04:00');
    expect(timer.formattedRemaining).toBe('06:00 left');
    expect(timer.progressPercentage).toBe(40);
  });

  it('should accurately detect overdue condition when preparation exceeds estimate', () => {
    const startedAt = new Date('2026-10-24T10:05:00Z');
    const estimatedCompletion = new Date('2026-10-24T10:15:00Z');

    const preparingOrder: OrderDto = {
      ...baseOrder,
      status: OrderStatus.PREPARING,
      preparationStartedAt: startedAt.toISOString(),
      estimatedCompletionAt: estimatedCompletion.toISOString()
    };

    // 12 minutes in (10:17:15Z) -> 2m 15s overdue
    const nowMs = new Date('2026-10-24T10:17:15Z').getTime();
    const timer = calculateOrderTimer(preparingOrder, nowMs);

    expect(timer.isOverdue).toBe(true);
    expect(timer.remainingSeconds).toBe(-135);
    expect(timer.overdueSeconds).toBe(135);
    expect(timer.formattedRemaining).toBe('+02:15 overdue');
  });

  it('should include preparation time adjustments in total estimate', () => {
    const startedAt = new Date('2026-10-24T10:05:00Z');
    // Original 10m + 5m adjustment = 15m total (target: 10:20:00Z)
    const estimatedCompletion = new Date('2026-10-24T10:20:00Z');

    const orderWithAdj: OrderDto = {
      ...baseOrder,
      status: OrderStatus.PREPARING,
      preparationStartedAt: startedAt.toISOString(),
      estimatedCompletionAt: estimatedCompletion.toISOString(),
      prepAdjustments: [
        {
          id: 'adj-1',
          orderId: 'ord-123',
          staffId: 'staff-k1',
          minutesAdded: 5,
          previousEstimatedCompletionAt: '2026-10-24T10:15:00Z',
          newEstimatedCompletionAt: '2026-10-24T10:20:00Z',
          reason: 'Rush hour backlog',
          createdAt: '2026-10-24T10:08:00Z'
        }
      ]
    };

    const nowMs = new Date('2026-10-24T10:12:00Z').getTime(); // 7m in
    const timer = calculateOrderTimer(orderWithAdj, nowMs);

    expect(timer.totalEstimatedMinutes).toBe(15);
    expect(timer.adjustmentsMinutesTotal).toBe(5);
    expect(timer.elapsedSeconds).toBe(420); // 7 min
    expect(timer.remainingSeconds).toBe(480); // 8 min remaining
    expect(timer.isOverdue).toBe(false);
  });

  it('should validate adjustPrepTimeSchema rejects invalid/negative numbers', () => {
    expect(adjustPrepTimeSchema.safeParse({ minutesAdded: 5 }).success).toBe(true);
    expect(adjustPrepTimeSchema.safeParse({ minutesAdded: 1, reason: 'Extra crispy' }).success).toBe(true);
    expect(adjustPrepTimeSchema.safeParse({ minutesAdded: 0 }).success).toBe(false);
    expect(adjustPrepTimeSchema.safeParse({ minutesAdded: -5 }).success).toBe(false);
    expect(adjustPrepTimeSchema.safeParse({ minutesAdded: 121 }).success).toBe(false);
    expect(adjustPrepTimeSchema.safeParse({ minutesAdded: 3.5 }).success).toBe(false);
  });

  it('should validate assignOrderSchema requires valid uuid', () => {
    expect(assignOrderSchema.safeParse({ staffId: 'c8065f49-555e-49b5-a337-b0885e35fb01' }).success).toBe(true);
    expect(assignOrderSchema.safeParse({ staffId: 'not-a-uuid' }).success).toBe(false);
    expect(assignOrderSchema.safeParse({}).success).toBe(false);
  });
});
