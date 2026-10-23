import { comparePassword } from '../../utils/password.js';
import { OrderStatus, TrackingOrderDto, DisplayBoardData } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { NotFoundError, UnauthorizedError, TooManyRequestsError } from '../../utils/errors.js';
import { generateTrackingToken } from '../../utils/token.js';

// Sliding-window IP rate limiter for brute-force PIN protection (10 attempts per minute per IP)
interface IpRateRecord {
  attempts: number;
  firstAttemptTime: number;
}
const ipAttemptsMap = new Map<string, IpRateRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_FAILED_ATTEMPTS = 10;

const checkRateLimit = (ipAddress: string) => {
  const now = Date.now();
  const record = ipAttemptsMap.get(ipAddress);

  if (record) {
    if (now - record.firstAttemptTime > RATE_LIMIT_WINDOW_MS) {
      // Window expired, reset
      ipAttemptsMap.set(ipAddress, { attempts: 1, firstAttemptTime: now });
    } else {
      record.attempts += 1;
      if (record.attempts > MAX_FAILED_ATTEMPTS) {
        throw new TooManyRequestsError(
          'Too many failed verification attempts. Please wait 1 minute before trying again.',
          'TOO_MANY_REQUESTS'
        );
      }
    }
  } else {
    ipAttemptsMap.set(ipAddress, { attempts: 1, firstAttemptTime: now });
  }
};

const clearRateLimit = (ipAddress: string) => {
  ipAttemptsMap.delete(ipAddress);
};

export const sanitizeTrackingOrder = (order: any): TrackingOrderDto => ({
  id: order.id,
  dailyOrderNumber: order.dailyOrderNumber,
  status: order.status as OrderStatus,
  initialEstimatedMinutes: order.initialEstimatedMinutes,
  preparationStartedAt: order.preparationStartedAt ? order.preparationStartedAt.toISOString() : null,
  estimatedCompletionAt: order.estimatedCompletionAt ? order.estimatedCompletionAt.toISOString() : null,
  preparedAt: order.preparedAt ? order.preparedAt.toISOString() : null,
  completedAt: order.completedAt ? order.completedAt.toISOString() : null,
  cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
  cancellationReason: order.cancellationReason || null,
  createdAt: order.createdAt.toISOString(),
  items: (order.items || []).map((item: any) => ({
    name: item.nameSnapshot,
    quantity: item.quantity,
    notes: item.notes
  })),
  prepAdjustments: (order.prepAdjustments || []).map((adj: any) => ({
    minutesAdded: adj.minutesAdded,
    reason: adj.reason,
    createdAt: adj.createdAt.toISOString()
  }))
});

/**
 * Verify customer order credentials and issue a signed, short-lived tracking token
 */
export const verifyOrder = async (
  dailyOrderNumber: string,
  pin: string,
  ipAddress: string = 'unknown'
): Promise<{ trackingToken: string; order: TrackingOrderDto }> => {
  const normalizedOrderNumber = dailyOrderNumber.trim().toUpperCase();

  // Find recent order matching this dailyOrderNumber (within last 48 hours)
  const sinceDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const order = await prisma.order.findFirst({
    where: {
      dailyOrderNumber: normalizedOrderNumber,
      createdAt: { gte: sinceDate }
    },
    orderBy: { createdAt: 'desc' },
    include: {
      items: true,
      prepAdjustments: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!order) {
    checkRateLimit(ipAddress);
    throw new UnauthorizedError(
      'Invalid Order Number or PIN combination.',
      'INVALID_VERIFICATION'
    );
  }

  // Compare 4-digit PIN against salted customerPinHash
  const isMatch = await comparePassword(pin.trim(), order.customerPinHash);
  if (!isMatch) {
    checkRateLimit(ipAddress);
    throw new UnauthorizedError(
      'Invalid Order Number or PIN combination.',
      'INVALID_VERIFICATION'
    );
  }

  // Successful verification clears failed attempt counter
  clearRateLimit(ipAddress);

  const trackingToken = generateTrackingToken(order.id, order.dailyOrderNumber);

  return {
    trackingToken,
    order: sanitizeTrackingOrder(order)
  };
};

/**
 * Fetch latest authoritative tracking state for verified order
 */
export const getTrackingStatus = async (orderId: string): Promise<TrackingOrderDto> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      prepAdjustments: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!order) {
    throw new NotFoundError('Order not found or tracking session has expired.', 'ORDER_NOT_FOUND');
  }

  return sanitizeTrackingOrder(order);
};

/**
 * Public Cafeteria Display Board Data
 * Returns active order numbers only: zero customer names, zero items, zero prices.
 */
export const getPublicBoardData = async (): Promise<DisplayBoardData> => {
  const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.PREPARING, OrderStatus.PREPARED] },
      createdAt: { gte: sinceDate }
    },
    select: {
      dailyOrderNumber: true,
      status: true,
      preparedAt: true,
      preparationStartedAt: true
    },
    orderBy: { createdAt: 'asc' }
  });

  const preparing = orders
    .filter((o) => o.status === OrderStatus.PREPARING)
    .map((o) => o.dailyOrderNumber);

  const ready = orders
    .filter((o) => o.status === OrderStatus.PREPARED)
    .map((o) => o.dailyOrderNumber);

  return {
    preparing,
    ready,
    lastUpdated: new Date().toISOString()
  };
};
