import { OrderStatus } from '../constants/order-status.js';

export interface OrderItemDto {
  id: string;
  orderId: string;
  menuItemId: string;
  nameSnapshot: string;
  unitPricePaiseSnapshot: number;
  prepTimeMinutesSnapshot: number;
  quantity: number;
  subtotalPaise: number;
  notes: string | null;
}

export interface OrderStatusHistoryDto {
  id: string;
  orderId: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  changedById: string;
  changedByName?: string;
  reason: string | null;
  timestamp: string;
}

export interface OrderDto {
  id: string;
  dailyOrderNumber: string;
  orderDate: string;
  idempotencyKey: string;
  status: OrderStatus;
  totalPaise: number;
  initialEstimatedMinutes: number;
  preparationStartedAt: string | null;
  estimatedCompletionAt: string | null;
  preparedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdById: string;
  createdByName?: string;
  assignedToId: string | null;
  assignedToName?: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDto[];
  statusHistory?: OrderStatusHistoryDto[];
}

export interface CreateOrderResponseData {
  order: OrderDto;
  customerVerificationPin: string; // Plaintext PIN returned strictly in 201 response for counter staff
}
