import crypto from 'crypto';
import { CreateOrderInput, OrderDto, OrderStatus, Role } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { hashPassword } from '../../utils/password.js';
import { logAudit } from '../audit/audit.service.js';
import { getNextDailyOrderNumber } from './sequence.service.js';
import { getIO } from '../events/socket.js';

const sanitizeOrder = (order: any): OrderDto => ({
  id: order.id,
  dailyOrderNumber: order.dailyOrderNumber,
  orderDate: order.orderDate instanceof Date ? order.orderDate.toISOString().split('T')[0] : String(order.orderDate),
  idempotencyKey: order.idempotencyKey,
  status: order.status as OrderStatus,
  totalPaise: order.totalPaise,
  initialEstimatedMinutes: order.initialEstimatedMinutes,
  preparationStartedAt: order.preparationStartedAt ? order.preparationStartedAt.toISOString() : null,
  estimatedCompletionAt: order.estimatedCompletionAt ? order.estimatedCompletionAt.toISOString() : null,
  preparedAt: order.preparedAt ? order.preparedAt.toISOString() : null,
  completedAt: order.completedAt ? order.completedAt.toISOString() : null,
  cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
  cancellationReason: order.cancellationReason,
  createdById: order.createdById,
  createdByName: order.createdBy?.name,
  assignedToId: order.assignedToId,
  assignedToName: order.assignedTo?.name,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
  items: (order.items || []).map((item: any) => ({
    id: item.id,
    orderId: item.orderId,
    menuItemId: item.menuItemId,
    nameSnapshot: item.nameSnapshot,
    unitPricePaiseSnapshot: item.unitPricePaiseSnapshot,
    prepTimeMinutesSnapshot: item.prepTimeMinutesSnapshot,
    quantity: item.quantity,
    subtotalPaise: item.subtotalPaise,
    notes: item.notes
  })),
  statusHistory: (order.statusHistory || []).map((h: any) => ({
    id: h.id,
    orderId: h.orderId,
    previousStatus: h.previousStatus as OrderStatus | null,
    newStatus: h.newStatus as OrderStatus,
    changedById: h.changedById,
    changedByName: h.changedBy?.name,
    reason: h.reason,
    timestamp: h.timestamp.toISOString()
  }))
});

export const createOrder = async (
  input: CreateOrderInput,
  createdById: string,
  role: Role,
  ipAddress?: string
): Promise<{ order: OrderDto; customerVerificationPin: string }> => {
  // 1. Check idempotency: if an order with this idempotencyKey already exists, return it
  const existingOrder = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: {
      items: true,
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } }
    }
  });

  if (existingOrder) {
    return {
      order: sanitizeOrder(existingOrder),
      customerVerificationPin: '****' // Plaintext PIN was returned on the first creation
    };
  }

  // 2. Fetch all ordered menu items from DB to guarantee current authoritative prices & availability
  const itemIds = input.items.map((i) => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: itemIds } }
  });

  const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

  // Verify all items exist and are available
  for (const itemInput of input.items) {
    const menuItem = menuItemMap.get(itemInput.menuItemId);
    if (!menuItem) {
      throw new NotFoundError(`Menu item "${itemInput.menuItemId}" not found.`, 'ITEM_NOT_FOUND');
    }
    if (!menuItem.isAvailable) {
      throw new BadRequestError(`Menu item "${menuItem.name}" is currently unavailable.`, 'ITEM_UNAVAILABLE');
    }
  }

  // Calculate authoritative prices, snapshots, and estimates
  let totalPaise = 0;
  let maxPrepTime = 0;

  const itemSnapshots = input.items.map((itemInput) => {
    const menuItem = menuItemMap.get(itemInput.menuItemId)!;
    const subtotalPaise = menuItem.pricePaise * itemInput.quantity;
    totalPaise += subtotalPaise;

    if (menuItem.prepTimeMinutes > maxPrepTime) {
      maxPrepTime = menuItem.prepTimeMinutes;
    }

    return {
      menuItemId: menuItem.id,
      nameSnapshot: menuItem.name,
      unitPricePaiseSnapshot: menuItem.pricePaise,
      prepTimeMinutesSnapshot: menuItem.prepTimeMinutes,
      quantity: itemInput.quantity,
      subtotalPaise,
      notes: itemInput.notes ?? null
    };
  });

  const initialEstimatedMinutes = maxPrepTime > 0 ? maxPrepTime : 10;

  // 3. Generate secure random 4-digit PIN (e.g. 1000 - 9999)
  const pin = crypto.randomInt(1000, 10000).toString();
  const customerPinHash = await hashPassword(pin);

  // 4. Atomic transaction to generate daily sequence and persist order
  const orderDate = new Date();

  const createdOrder = await prisma.$transaction(async (tx) => {
    // Generate atomic sequence number (e.g. CB-101)
    const dailyOrderNumber = await getNextDailyOrderNumber(orderDate, tx);

    const order = await tx.order.create({
      data: {
        dailyOrderNumber,
        orderDate,
        idempotencyKey: input.idempotencyKey,
        status: OrderStatus.PLACED,
        totalPaise,
        customerPinHash,
        initialEstimatedMinutes,
        createdById,
        assignedToId: input.assignedToId ?? null,
        items: {
          create: itemSnapshots
        },
        statusHistory: {
          create: {
            previousStatus: null,
            newStatus: OrderStatus.PLACED,
            changedById: createdById,
            reason: 'Order placed at counter terminal'
          }
        }
      },
      include: {
        items: true,
        createdBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
        statusHistory: {
          include: { changedBy: { select: { name: true } } }
        }
      }
    });

    return order;
  });

  // 5. Log operational audit
  await logAudit({
    actorId: createdById,
    actorRole: role,
    action: 'ORDER_CREATED',
    entityType: 'Order',
    entityId: createdOrder.id,
    metadata: {
      dailyOrderNumber: createdOrder.dailyOrderNumber,
      totalPaise: createdOrder.totalPaise,
      itemCount: createdOrder.items.length
    },
    ipAddress
  });

  // 6. Broadcast new order event to kitchen and counter (EXCLUDING PIN!)
  const io = getIO();
  if (io) {
    io.to('staff:kitchen').to('staff:counter').to('staff:admin').emit('ORDER_CREATED', {
      orderId: createdOrder.id,
      dailyOrderNumber: createdOrder.dailyOrderNumber,
      totalPaise: createdOrder.totalPaise,
      initialEstimatedMinutes: createdOrder.initialEstimatedMinutes,
      items: createdOrder.items.map((i) => ({
        name: i.nameSnapshot,
        quantity: i.quantity,
        notes: i.notes
      })),
      createdAt: createdOrder.createdAt.toISOString()
    });
  }

  return {
    order: sanitizeOrder(createdOrder),
    customerVerificationPin: pin
  };
};

export const listOrders = async (filters: {
  status?: OrderStatus[];
  date?: string;
  limit?: number;
} = {}): Promise<OrderDto[]> => {
  const where: any = {};

  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }

  if (filters.date) {
    where.orderDate = new Date(filters.date);
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filters.limit || 50,
    include: {
      items: true,
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      statusHistory: {
        orderBy: { timestamp: 'asc' },
        include: { changedBy: { select: { name: true } } }
      }
    }
  });

  return orders.map(sanitizeOrder);
};

export const getOrderById = async (id: string): Promise<OrderDto> => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      statusHistory: {
        orderBy: { timestamp: 'asc' },
        include: { changedBy: { select: { name: true } } }
      }
    }
  });

  if (!order) {
    throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
  }

  return sanitizeOrder(order);
};

export const markHandover = async (
  id: string,
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<OrderDto> => {
  const order = await prisma.order.findUnique({
    where: { id }
  });

  if (!order) {
    throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
  }

  if (order.status !== OrderStatus.PREPARED) {
    throw new BadRequestError(
      `Cannot hand over order in "${order.status}" status. Order must be PREPARED first.`,
      'INVALID_STATUS_FOR_HANDOVER'
    );
  }

  const completedAt = new Date();

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: OrderStatus.COMPLETED,
        completedAt
      },
      include: {
        items: true,
        createdBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
        statusHistory: {
          orderBy: { timestamp: 'asc' },
          include: { changedBy: { select: { name: true } } }
        }
      }
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        previousStatus: OrderStatus.PREPARED,
        newStatus: OrderStatus.COMPLETED,
        changedById: staffId,
        reason: 'Order handed over to customer at counter'
      }
    });

    return updated;
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'ORDER_HANDED_OVER',
    entityType: 'Order',
    entityId: id,
    metadata: { dailyOrderNumber: updatedOrder.dailyOrderNumber },
    ipAddress
  });

  const io = getIO();
  if (io) {
    io.to('staff:counter').to('staff:admin').emit('ORDER_COMPLETED', {
      orderId: updatedOrder.id,
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      completedAt: completedAt.toISOString()
    });
  }

  return sanitizeOrder(updatedOrder);
};

export const cancelOrder = async (
  id: string,
  reason: string,
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<OrderDto> => {
  const order = await prisma.order.findUnique({
    where: { id }
  });

  if (!order) {
    throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
  }

  if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
    throw new BadRequestError(
      `Order cannot be cancelled because it is already in "${order.status}" status.`,
      'ORDER_CANNOT_BE_CANCELLED'
    );
  }

  // Authorization rule:
  // Counter staff can only cancel orders in PLACED status
  if (role === Role.COUNTER && order.status !== OrderStatus.PLACED) {
    throw new ForbiddenError(
      `Counter staff can only cancel orders in PLACED status. This order is ${order.status}. Contact an administrator.`,
      'CANCEL_PERMISSION_DENIED'
    );
  }

  const cancelledAt = new Date();

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt,
        cancellationReason: reason
      },
      include: {
        items: true,
        createdBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
        statusHistory: {
          orderBy: { timestamp: 'asc' },
          include: { changedBy: { select: { name: true } } }
        }
      }
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        previousStatus: order.status,
        newStatus: OrderStatus.CANCELLED,
        changedById: staffId,
        reason
      }
    });

    return updated;
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'ORDER_CANCELLED',
    entityType: 'Order',
    entityId: id,
    metadata: {
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      reason,
      cancelledByRole: role
    },
    ipAddress
  });

  const io = getIO();
  if (io) {
    io.to('staff:kitchen').to('staff:counter').to('staff:admin').emit('ORDER_CANCELLED', {
      orderId: updatedOrder.id,
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      reason,
      cancelledAt: cancelledAt.toISOString()
    });
  }

  return sanitizeOrder(updatedOrder);
};
