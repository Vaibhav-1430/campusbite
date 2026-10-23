import { OrderStatus } from '../constants/order-status.js';

export interface TrackingOrderItemDto {
  name: string;
  quantity: number;
  notes?: string | null;
}

export interface TrackingOrderDto {
  id: string;
  dailyOrderNumber: string;
  status: OrderStatus;
  initialEstimatedMinutes: number;
  preparationStartedAt: string | null;
  estimatedCompletionAt: string | null;
  preparedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  items: TrackingOrderItemDto[];
  prepAdjustments?: {
    minutesAdded: number;
    reason?: string | null;
    createdAt: string;
  }[];
}

export interface TrackingVerifyResponseData {
  trackingToken: string;
  order: TrackingOrderDto;
}

export interface DisplayBoardData {
  preparing: string[];
  ready: string[];
  lastUpdated: string;
}
