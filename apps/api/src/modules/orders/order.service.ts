import crypto from 'crypto';
import { CreateOrderInput, OrderDto, OrderStatus, Role } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { hashPassword } from '../../utils/password.js';
import { logAudit } from '../audit/audit.service.js';
import { getNextDailyOrderNumber } from './sequence.service.js';
import { getIO } from '../events/socket.js';

const defaultOrderInclude = {
  items: true,
  createdBy: { select: { name: true } },
  assignedTo: { select: { name: true } },
  statusHistory: {
    orderBy: { timestamp: 'asc' as const },
    include: { changedBy: { select: { name: true } } }
  },
  prepAdjustments: {
    orderBy: { createdAt: 'asc' as const },
    include: { staff: { select: { name: true } } }
  }
};

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
  })),
  prepAdjustments: (order.prepAdjustments || []).map((adj: any) => ({
    id: adj.id,
    orderId: adj.orderId,
    staffId: adj.staffId,
    staffName: adj.staff?.name,
    minutesAdded: adj.minutesAdded,
    previousEstimatedCompletionAt: adj.previousEstimatedCompletionAt.toISOString(),
    newEstimatedCompletionAt: adj.newEstimatedCompletionAt.toISOString(),
    reason: adj.reason,
    createdAt: adj.createdAt.toISOString()
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
    include: defaultOrderInclude
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

  // 3. Aggregate required stock per stockItemId
  const requiredStockMap = new Map<string, { quantity: number; menuItemName: string }>();
  for (const itemInput of input.items) {
    const menuItem = menuItemMap.get(itemInput.menuItemId)!;
    if (menuItem.stockItemId) {
      const existing = requiredStockMap.get(menuItem.stockItemId);
      if (existing) {
        existing.quantity += itemInput.quantity;
      } else {
        requiredStockMap.set(menuItem.stockItemId, {
          quantity: itemInput.quantity,
          menuItemName: menuItem.name
        });
      }
    }
  }

  // 4. Generate secure random 4-digit PIN (e.g. 1000 - 9999)
  const pin = crypto.randomInt(1000, 10000).toString();
  const customerPinHash = await hashPassword(pin);

  // 5. Atomic transaction to validate/deduct stock, generate sequence, and persist order
  const orderDate = new Date();
  const affectedStockAlerts: Array<{ id: string; name: string; currentQuantity: number; lowStockThreshold: number }> = [];

  const createdOrder = await prisma.$transaction(async (tx) => {
    // 5a. Deduct stock for all tracked items
    for (const [stockItemId, { quantity: requiredQty, menuItemName }] of requiredStockMap.entries()) {
      const stock = await tx.stockItem.findUnique({ where: { id: stockItemId } });
      if (!stock) {
        throw new NotFoundError(`Stock item for "${menuItemName}" not found.`, 'STOCK_ITEM_NOT_FOUND');
      }

      if (stock.currentQuantity < requiredQty) {
        throw new BadRequestError(
          `Insufficient stock for "${menuItemName}". Only ${stock.currentQuantity} ${stock.unit} available (requested: ${requiredQty}).`,
          'INSUFFICIENT_STOCK'
        );
      }

      const updatedStock = await tx.stockItem.update({
        where: { id: stockItemId },
        data: { currentQuantity: { decrement: requiredQty } }
      });

      affectedStockAlerts.push({
        id: updatedStock.id,
        name: updatedStock.name,
        currentQuantity: updatedStock.currentQuantity,
        lowStockThreshold: updatedStock.lowStockThreshold
      });
    }

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
      include: defaultOrderInclude
    });

    // 5b. Record inventory deduction movements linked to the created order
    for (const [stockItemId, { quantity: requiredQty }] of requiredStockMap.entries()) {
      const affected = affectedStockAlerts.find((s) => s.id === stockItemId);
      const previousQuantity = affected ? affected.currentQuantity + requiredQty : requiredQty;
      const newQuantity = affected ? affected.currentQuantity : 0;

      await tx.inventoryMovement.create({
        data: {
          stockItemId,
          quantityChange: -requiredQty,
          previousQuantity,
          newQuantity,
          type: 'ORDER_DEDUCTION',
          orderId: order.id,
          performedById: createdById,
          note: `Sold in Order #${dailyOrderNumber}`
        }
      });
    }

    return order;
  });

  // Emit stock updates and low-stock alerts
  const ioStock = getIO();
  if (ioStock && affectedStockAlerts.length > 0) {
    for (const stockInfo of affectedStockAlerts) {
      ioStock.to('staff:admin').to('staff:counter').emit('STOCK_UPDATED', {
        stockItemId: stockInfo.id,
        name: stockInfo.name,
        currentQuantity: stockInfo.currentQuantity,
        lowStockThreshold: stockInfo.lowStockThreshold
      });

      if (stockInfo.currentQuantity <= stockInfo.lowStockThreshold) {
        ioStock.to('staff:admin').to('staff:counter').emit('STOCK_LOW_ALERT', {
          stockItemId: stockInfo.id,
          name: stockInfo.name,
          currentQuantity: stockInfo.currentQuantity,
          lowStockThreshold: stockInfo.lowStockThreshold
        });
      }
    }
  }

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
  direction?: 'asc' | 'desc';
} = {}): Promise<OrderDto[]> => {
  const where: any = {};

  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }

  if (filters.date) {
    where.orderDate = new Date(filters.date);
  }

  const orderByDirection = filters.direction || 'desc';

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: orderByDirection },
    take: filters.limit || 100,
    include: defaultOrderInclude
  });

  return orders.map(sanitizeOrder);
};

export const getOrderById = async (id: string): Promise<OrderDto> => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: defaultOrderInclude
  });

  if (!order) {
    throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
  }

  return sanitizeOrder(order);
};

/**
 * Claim an unassigned order by a kitchen staff member.
 * Atomic conditional update prevents concurrent double-claiming.
 */
export const claimOrder = async (
  id: string,
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<OrderDto> => {
  const staff = await prisma.user.findUnique({
    where: { id: staffId }
  });

  if (!staff || !staff.isActive) {
    throw new ForbiddenError('Staff account is inactive or not found.', 'STAFF_INACTIVE');
  }

  // Atomic conditional update: only update if currently unassigned and eligible
  const updateResult = await prisma.order.updateMany({
    where: {
      id,
      assignedToId: null,
      status: { in: [OrderStatus.PLACED, OrderStatus.PREPARING] }
    },
    data: {
      assignedToId: staffId
    }
  });

  if (updateResult.count === 0) {
    const existing = await prisma.order.findUnique({
      where: { id },
      include: { assignedTo: { select: { name: true } } }
    });

    if (!existing) {
      throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
    }
    if (existing.assignedToId) {
      throw new BadRequestError(
        `Order is already claimed by ${existing.assignedTo?.name || 'another staff member'}.`,
        'ALREADY_CLAIMED'
      );
    }
    throw new BadRequestError(
      `Cannot claim order in "${existing.status}" status.`,
      'INVALID_STATUS_FOR_CLAIM'
    );
  }

  const updatedOrder = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: defaultOrderInclude
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'ORDER_CLAIMED',
    entityType: 'Order',
    entityId: id,
    metadata: { dailyOrderNumber: updatedOrder.dailyOrderNumber },
    ipAddress
  });

  const io = getIO();
  if (io) {
    io.to('staff:kitchen').to('staff:counter').to('staff:admin').emit('ORDER_CLAIMED', {
      orderId: updatedOrder.id,
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      assignedToId: staffId,
      assignedToName: staff.name
    });
  }

  return sanitizeOrder(updatedOrder);
};

/**
 * Explicitly assign an order to a specific kitchen cook (Counter / Admin action).
 */
export const assignOrder = async (
  id: string,
  targetStaffId: string,
  actorId: string,
  role: Role,
  ipAddress?: string
): Promise<OrderDto> => {
  const targetStaff = await prisma.user.findUnique({
    where: { id: targetStaffId }
  });

  if (!targetStaff || !targetStaff.isActive || targetStaff.role !== Role.KITCHEN) {
    throw new BadRequestError(
      'Target staff member must be an active user with KITCHEN role.',
      'INVALID_ASSIGNMENT_TARGET'
    );
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
  }

  if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
    throw new BadRequestError(
      `Cannot assign order in "${order.status}" status.`,
      'INVALID_STATUS_FOR_ASSIGNMENT'
    );
  }

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: { assignedToId: targetStaffId },
    include: defaultOrderInclude
  });

  await logAudit({
    actorId,
    actorRole: role,
    action: 'ORDER_ASSIGNED',
    entityType: 'Order',
    entityId: id,
    metadata: {
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      assignedToId: targetStaffId,
      assignedToName: targetStaff.name
    },
    ipAddress
  });

  const io = getIO();
  if (io) {
    io.to('staff:kitchen').to('staff:counter').to('staff:admin').emit('ORDER_ASSIGNED', {
      orderId: updatedOrder.id,
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      assignedToId: targetStaffId,
      assignedToName: targetStaff.name
    });
  }

  return sanitizeOrder(updatedOrder);
};

/**
 * Kitchen explicitly starts preparation. Authoritative countdown begins NOW.
 * Atomic conditional update prevents race conditions with counter cancellations.
 */
export const startPreparation = async (
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

  const preparationStartedAt = new Date();
  const estimatedCompletionAt = new Date(
    preparationStartedAt.getTime() + order.initialEstimatedMinutes * 60 * 1000
  );

  // Atomic conditional update: ONLY start if status is still PLACED
  const updateResult = await prisma.order.updateMany({
    where: {
      id,
      status: OrderStatus.PLACED
    },
    data: {
      status: OrderStatus.PREPARING,
      preparationStartedAt,
      estimatedCompletionAt,
      // If unassigned, automatically assign to cook starting prep
      assignedToId: order.assignedToId || staffId
    }
  });

  if (updateResult.count === 0) {
    const current = await prisma.order.findUnique({ where: { id } });
    if (!current) throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
    if (current.status === OrderStatus.CANCELLED) {
      throw new BadRequestError('Cannot start preparation: order was cancelled.', 'ORDER_ALREADY_CANCELLED');
    }
    if (current.status === OrderStatus.PREPARING) {
      throw new BadRequestError('Order is already in preparation.', 'ALREADY_PREPARING');
    }
    throw new BadRequestError(
      `Cannot start preparation from "${current.status}" status.`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  // Record status transition in history
  await prisma.orderStatusHistory.create({
    data: {
      orderId: id,
      previousStatus: OrderStatus.PLACED,
      newStatus: OrderStatus.PREPARING,
      changedById: staffId,
      reason: 'Kitchen began cooking preparation'
    }
  });

  const updatedOrder = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: defaultOrderInclude
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'ORDER_PREPARATION_STARTED',
    entityType: 'Order',
    entityId: id,
    metadata: {
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      preparationStartedAt: preparationStartedAt.toISOString(),
      estimatedCompletionAt: estimatedCompletionAt.toISOString()
    },
    ipAddress
  });

  const io = getIO();
  if (io) {
    io.to('staff:kitchen')
      .to('staff:counter')
      .to('staff:admin')
      .to(`order:${updatedOrder.id}`)
      .emit('ORDER_PREPARING', {
        orderId: updatedOrder.id,
        dailyOrderNumber: updatedOrder.dailyOrderNumber,
        preparationStartedAt: preparationStartedAt.toISOString(),
        estimatedCompletionAt: estimatedCompletionAt.toISOString(),
        initialEstimatedMinutes: updatedOrder.initialEstimatedMinutes,
        assignedToId: updatedOrder.assignedToId,
        assignedToName: updatedOrder.assignedTo?.name
      });

    io.to('board:public').emit('BOARD_UPDATED');
  }

  return sanitizeOrder(updatedOrder);
};

/**
 * Add preparation time while an order is preparing (+1, +3, +5, custom minutes).
 * Authoritatively recalculates estimated completion and logs the adjustment.
 */
export const adjustPreparationTime = async (
  id: string,
  minutesAdded: number,
  reason: string | null | undefined,
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<OrderDto> => {
  if (!Number.isInteger(minutesAdded) || minutesAdded <= 0 || minutesAdded > 120) {
    throw new BadRequestError(
      'Minutes added must be a positive integer between 1 and 120.',
      'INVALID_MINUTES_ADDED'
    );
  }

  const order = await prisma.order.findUnique({
    where: { id }
  });

  if (!order) {
    throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
  }

  if (order.status !== OrderStatus.PREPARING) {
    throw new BadRequestError(
      `Cannot adjust preparation time for order in "${order.status}" status. Order must be PREPARING.`,
      'INVALID_STATUS_FOR_TIME_ADJUSTMENT'
    );
  }

  const baseEstimate = order.estimatedCompletionAt
    ? new Date(order.estimatedCompletionAt)
    : new Date(order.preparationStartedAt!.getTime() + order.initialEstimatedMinutes * 60 * 1000);

  const newEstimatedCompletionAt = new Date(baseEstimate.getTime() + minutesAdded * 60 * 1000);

  const updatedOrder = await prisma.$transaction(async (tx) => {
    await tx.preparationTimeAdjustment.create({
      data: {
        orderId: id,
        staffId,
        minutesAdded,
        previousEstimatedCompletionAt: baseEstimate,
        newEstimatedCompletionAt,
        reason: reason?.trim() || null
      }
    });

    const updated = await tx.order.update({
      where: { id },
      data: {
        estimatedCompletionAt: newEstimatedCompletionAt
      },
      include: defaultOrderInclude
    });

    return updated;
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'PREP_TIME_ADJUSTED',
    entityType: 'Order',
    entityId: id,
    metadata: {
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      minutesAdded,
      previousEstimatedCompletionAt: baseEstimate.toISOString(),
      newEstimatedCompletionAt: newEstimatedCompletionAt.toISOString(),
      reason
    },
    ipAddress
  });

  const io = getIO();
  if (io) {
    io.to('staff:kitchen')
      .to('staff:counter')
      .to('staff:admin')
      .to(`order:${updatedOrder.id}`)
      .emit('ORDER_TIME_ADJUSTED', {
        orderId: updatedOrder.id,
        dailyOrderNumber: updatedOrder.dailyOrderNumber,
        minutesAdded,
        newEstimatedCompletionAt: newEstimatedCompletionAt.toISOString(),
        reason
      });

    io.to('board:public').emit('BOARD_UPDATED');
  }

  return sanitizeOrder(updatedOrder);
};

/**
 * Kitchen cook finishes cooking: transitions to PREPARED.
 * Signals counter staff that order is ready for customer handover.
 */
export const markPrepared = async (
  id: string,
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<OrderDto> => {
  const preparedAt = new Date();

  // Atomic conditional update: order must be PREPARING
  const updateResult = await prisma.order.updateMany({
    where: {
      id,
      status: OrderStatus.PREPARING
    },
    data: {
      status: OrderStatus.PREPARED,
      preparedAt
    }
  });

  if (updateResult.count === 0) {
    const current = await prisma.order.findUnique({ where: { id } });
    if (!current) throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
    if (current.status === OrderStatus.PREPARED) {
      throw new BadRequestError('Order is already marked PREPARED.', 'ALREADY_PREPARED');
    }
    throw new BadRequestError(
      `Cannot mark prepared from "${current.status}" status. Order must be PREPARING.`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  await prisma.orderStatusHistory.create({
    data: {
      orderId: id,
      previousStatus: OrderStatus.PREPARING,
      newStatus: OrderStatus.PREPARED,
      changedById: staffId,
      reason: 'Kitchen cooking complete; ready for pickup'
    }
  });

  const updatedOrder = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: defaultOrderInclude
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'ORDER_PREPARED',
    entityType: 'Order',
    entityId: id,
    metadata: {
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      preparedAt: preparedAt.toISOString()
    },
    ipAddress
  });

  const io = getIO();
  if (io) {
    io.to('staff:kitchen')
      .to('staff:counter')
      .to('staff:admin')
      .to(`order:${updatedOrder.id}`)
      .emit('ORDER_PREPARED', {
        orderId: updatedOrder.id,
        dailyOrderNumber: updatedOrder.dailyOrderNumber,
        preparedAt: preparedAt.toISOString()
      });

    io.to('board:public').emit('BOARD_UPDATED');
  }

  return sanitizeOrder(updatedOrder);
};

/**
 * Counter marks order handed over to customer.
 * Enforces requirement: order must be PREPARED before it can be COMPLETED.
 */
export const markHandover = async (
  id: string,
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<OrderDto> => {
  const completedAt = new Date();

  // Atomic conditional update: must be in PREPARED status
  const updateResult = await prisma.order.updateMany({
    where: {
      id,
      status: OrderStatus.PREPARED
    },
    data: {
      status: OrderStatus.COMPLETED,
      completedAt
    }
  });

  if (updateResult.count === 0) {
    const current = await prisma.order.findUnique({ where: { id } });
    if (!current) throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
    if (current.status === OrderStatus.COMPLETED) {
      throw new BadRequestError('Order is already completed.', 'ALREADY_COMPLETED');
    }
    throw new BadRequestError(
      `Cannot hand over order in "${current.status}" status. Order must be PREPARED first.`,
      'INVALID_STATUS_FOR_HANDOVER'
    );
  }

  await prisma.orderStatusHistory.create({
    data: {
      orderId: id,
      previousStatus: OrderStatus.PREPARED,
      newStatus: OrderStatus.COMPLETED,
      changedById: staffId,
      reason: 'Order handed over to customer at counter'
    }
  });

  const updatedOrder = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: defaultOrderInclude
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
    io.to('staff:counter')
      .to('staff:kitchen')
      .to('staff:admin')
      .to(`order:${updatedOrder.id}`)
      .emit('ORDER_COMPLETED', {
        orderId: updatedOrder.id,
        dailyOrderNumber: updatedOrder.dailyOrderNumber,
        completedAt: completedAt.toISOString()
      });

    io.to('board:public').emit('BOARD_UPDATED');
  }

  return sanitizeOrder(updatedOrder);
};

/**
 * Cancel an order with mandatory reason.
 * Enforces cancellation policy:
 * - Counter can ONLY cancel PLACED orders.
 * - Admin can cancel PLACED or PREPARING orders.
 * - Kitchen staff CANNOT cancel orders.
 * Handled with atomic conditional updates to prevent race condition if kitchen starts preparing.
 */
export const cancelOrder = async (
  id: string,
  reason: string,
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<OrderDto> => {
  if (!reason || reason.trim().length < 3) {
    throw new BadRequestError('A non-empty cancellation reason (min 3 chars) is required.', 'REASON_REQUIRED');
  }

  if (role === Role.KITCHEN) {
    throw new ForbiddenError('Kitchen staff are not authorized to cancel orders.', 'CANCEL_PERMISSION_DENIED');
  }

  const cancelledAt = new Date();
  const eligibleStatuses = role === Role.COUNTER
    ? [OrderStatus.PLACED]
    : [OrderStatus.PLACED, OrderStatus.PREPARING];

  const restoredStockAlerts: Array<{ id: string; name: string; currentQuantity: number; lowStockThreshold: number }> = [];

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.order.updateMany({
      where: {
        id,
        status: { in: eligibleStatuses }
      },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt,
        cancellationReason: reason.trim()
      }
    });

    if (updateResult.count === 0) {
      const current = await tx.order.findUnique({ where: { id } });
      if (!current) throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
      if (current.status === OrderStatus.CANCELLED) {
        throw new BadRequestError('Order is already cancelled.', 'ALREADY_CANCELLED');
      }
      if (current.status === OrderStatus.COMPLETED) {
        throw new BadRequestError('Cannot cancel an order that has already been handed over.', 'ALREADY_COMPLETED');
      }
      if (role === Role.COUNTER && current.status === OrderStatus.PREPARING) {
        throw new BadRequestError(
          'Cannot cancel: kitchen has already begun preparing this order. Contact an administrator.',
          'ORDER_ALREADY_PREPARING'
        );
      }
      throw new BadRequestError(
        `Cannot cancel order in "${current.status}" status.`,
        'INVALID_STATUS_FOR_CANCELLATION'
      );
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        previousStatus: eligibleStatuses.length === 1 ? OrderStatus.PLACED : OrderStatus.PREPARING,
        newStatus: OrderStatus.CANCELLED,
        changedById: staffId,
        reason: reason.trim()
      }
    });

    // Restore any deducted inventory for this order
    const deductions = await tx.inventoryMovement.findMany({
      where: {
        orderId: id,
        type: 'ORDER_DEDUCTION'
      }
    });

    for (const deduction of deductions) {
      const restoreQty = Math.abs(deduction.quantityChange);
      const updatedStock = await tx.stockItem.update({
        where: { id: deduction.stockItemId },
        data: { currentQuantity: { increment: restoreQty } }
      });

      await tx.inventoryMovement.create({
        data: {
          stockItemId: deduction.stockItemId,
          quantityChange: restoreQty,
          previousQuantity: updatedStock.currentQuantity - restoreQty,
          newQuantity: updatedStock.currentQuantity,
          type: 'CANCELLATION_RESTORE',
          orderId: id,
          performedById: staffId,
          note: `Restored on cancellation: ${reason.trim()}`
        }
      });

      restoredStockAlerts.push({
        id: updatedStock.id,
        name: updatedStock.name,
        currentQuantity: updatedStock.currentQuantity,
        lowStockThreshold: updatedStock.lowStockThreshold
      });
    }

    return tx.order.findUniqueOrThrow({
      where: { id },
      include: defaultOrderInclude
    });
  });

  // Emit stock updates for restored items
  const ioStock = getIO();
  if (ioStock && restoredStockAlerts.length > 0) {
    for (const stockInfo of restoredStockAlerts) {
      ioStock.to('staff:admin').to('staff:counter').emit('STOCK_UPDATED', {
        stockItemId: stockInfo.id,
        name: stockInfo.name,
        currentQuantity: stockInfo.currentQuantity,
        lowStockThreshold: stockInfo.lowStockThreshold
      });
    }
  }

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'ORDER_CANCELLED',
    entityType: 'Order',
    entityId: id,
    metadata: {
      dailyOrderNumber: updatedOrder.dailyOrderNumber,
      reason: reason.trim(),
      cancelledByRole: role
    },
    ipAddress
  });

  const io = getIO();
  if (io) {
    io.to('staff:kitchen')
      .to('staff:counter')
      .to('staff:admin')
      .to(`order:${updatedOrder.id}`)
      .emit('ORDER_CANCELLED', {
        orderId: updatedOrder.id,
        dailyOrderNumber: updatedOrder.dailyOrderNumber,
        reason: reason.trim(),
        cancelledAt: cancelledAt.toISOString()
      });

    io.to('board:public').emit('BOARD_UPDATED');
  }

  return sanitizeOrder(updatedOrder);
};
