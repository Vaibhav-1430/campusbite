import { Role, InventoryMovementTypeString, StockItemDto, InventoryMovementDto, InventoryOverviewDto } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../utils/errors.js';
import { logAudit } from '../audit/audit.service.js';
import { getIO } from '../events/socket.js';

export const sanitizeStockItem = (item: any): StockItemDto => {
  const currentQuantity = item.currentQuantity;
  const lowStockThreshold = item.lowStockThreshold;

  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    currentQuantity,
    lowStockThreshold,
    isLowStock: currentQuantity <= lowStockThreshold,
    isOutOfStock: currentQuantity <= 0,
    linkedMenuItemCount: item._count ? item._count.menuItems : (item.menuItems ? item.menuItems.length : 0),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
};

export const sanitizeMovement = (movement: any): InventoryMovementDto => ({
  id: movement.id,
  stockItemId: movement.stockItemId,
  stockItemName: movement.stockItem?.name || 'Unknown',
  quantityChange: movement.quantityChange,
  previousQuantity: movement.previousQuantity ?? null,
  newQuantity: movement.newQuantity ?? null,
  type: movement.type as InventoryMovementTypeString,
  orderId: movement.orderId ?? null,
  orderNumber: movement.order?.dailyOrderNumber ?? null,
  performedById: movement.performedById,
  performedByName: movement.performedBy?.name || 'Staff',
  performedByRole: movement.performedBy?.role || 'STAFF',
  note: movement.note ?? null,
  createdAt: movement.createdAt.toISOString()
});

/**
 * Get aggregated inventory metrics and latest ledger entries
 */
export const getInventoryOverview = async (): Promise<InventoryOverviewDto> => {
  const stockItems = await prisma.stockItem.findMany({
    select: {
      id: true,
      currentQuantity: true,
      lowStockThreshold: true
    }
  });

  const totalStockItems = stockItems.length;
  let outOfStockCount = 0;
  let lowStockCount = 0;
  let healthyStockCount = 0;

  for (const item of stockItems) {
    if (item.currentQuantity <= 0) {
      outOfStockCount += 1;
      lowStockCount += 1;
    } else if (item.currentQuantity <= item.lowStockThreshold) {
      lowStockCount += 1;
    } else {
      healthyStockCount += 1;
    }
  }

  const recentMovementsRaw = await prisma.inventoryMovement.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      stockItem: { select: { name: true } },
      performedBy: { select: { name: true, role: true } },
      order: { select: { dailyOrderNumber: true } }
    }
  });

  return {
    totalStockItems,
    lowStockCount,
    outOfStockCount,
    healthyStockCount,
    recentMovements: recentMovementsRaw.map(sanitizeMovement)
  };
};

/**
 * List all stock items with optional filters
 */
export const listStockItems = async (query?: {
  search?: string;
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
}): Promise<StockItemDto[]> => {
  const where: any = {};

  if (query?.search && query.search.trim()) {
    where.name = { contains: query.search.trim(), mode: 'insensitive' };
  }

  const items = await prisma.stockItem.findMany({
    where,
    include: {
      _count: {
        select: { menuItems: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  let sanitized = items.map(sanitizeStockItem);

  if (query?.outOfStockOnly) {
    sanitized = sanitized.filter((item) => item.isOutOfStock);
  } else if (query?.lowStockOnly) {
    sanitized = sanitized.filter((item) => item.isLowStock);
  }

  return sanitized;
};

/**
 * Get detailed stock item by ID
 */
export const getStockItemById = async (id: string): Promise<StockItemDto & { menuItems: any[]; recentMovements: InventoryMovementDto[] }> => {
  const item = await prisma.stockItem.findUnique({
    where: { id },
    include: {
      menuItems: {
        select: {
          id: true,
          name: true,
          isAvailable: true,
          pricePaise: true,
          category: { select: { name: true } }
        }
      },
      inventoryMovements: {
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          stockItem: { select: { name: true } },
          performedBy: { select: { name: true, role: true } },
          order: { select: { dailyOrderNumber: true } }
        }
      }
    }
  });

  if (!item) {
    throw new NotFoundError('Stock item not found.', 'STOCK_ITEM_NOT_FOUND');
  }

  return {
    ...sanitizeStockItem(item),
    menuItems: item.menuItems,
    recentMovements: item.inventoryMovements.map(sanitizeMovement)
  };
};

/**
 * Create a new stock item with optional initial quantity
 */
export const createStockItem = async (
  input: { name: string; unit: string; currentQuantity: number; lowStockThreshold: number },
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<StockItemDto> => {
  const normalizedName = input.name.trim();

  const existing = await prisma.stockItem.findUnique({
    where: { name: normalizedName }
  });

  if (existing) {
    throw new ConflictError(
      `A stock item named "${normalizedName}" already exists.`,
      'DUPLICATE_STOCK_NAME'
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.stockItem.create({
      data: {
        name: normalizedName,
        unit: input.unit.trim(),
        currentQuantity: input.currentQuantity,
        lowStockThreshold: input.lowStockThreshold
      }
    });

    if (input.currentQuantity > 0) {
      await tx.inventoryMovement.create({
        data: {
          stockItemId: created.id,
          quantityChange: input.currentQuantity,
          previousQuantity: 0,
          newQuantity: input.currentQuantity,
          type: 'MANUAL_RESTOCK',
          performedById: staffId,
          note: 'Initial stock setup'
        }
      });
    }

    return created;
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'STOCK_ITEM_CREATED',
    entityType: 'StockItem',
    entityId: result.id,
    metadata: {
      name: result.name,
      unit: result.unit,
      currentQuantity: result.currentQuantity,
      lowStockThreshold: result.lowStockThreshold
    },
    ipAddress
  });

  return sanitizeStockItem(result);
};

/**
 * Update stock item metadata (name, unit, threshold)
 */
export const updateStockItem = async (
  id: string,
  input: { name?: string; unit?: string; lowStockThreshold?: number },
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<StockItemDto> => {
  const current = await prisma.stockItem.findUnique({ where: { id } });
  if (!current) {
    throw new NotFoundError('Stock item not found.', 'STOCK_ITEM_NOT_FOUND');
  }

  if (input.name && input.name.trim() !== current.name) {
    const duplicate = await prisma.stockItem.findUnique({
      where: { name: input.name.trim() }
    });
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError(
        `A stock item named "${input.name.trim()}" already exists.`,
        'DUPLICATE_STOCK_NAME'
      );
    }
  }

  const updated = await prisma.stockItem.update({
    where: { id },
    data: {
      name: input.name ? input.name.trim() : undefined,
      unit: input.unit ? input.unit.trim() : undefined,
      lowStockThreshold: input.lowStockThreshold !== undefined ? input.lowStockThreshold : undefined
    },
    include: {
      _count: {
        select: { menuItems: true }
      }
    }
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'STOCK_ITEM_UPDATED',
    entityType: 'StockItem',
    entityId: id,
    metadata: { previous: current, updated: input },
    ipAddress
  });

  return sanitizeStockItem(updated);
};

/**
 * Restock inventory (Positive quantity addition with optional note)
 */
export const restockStockItem = async (
  id: string,
  quantityAdded: number,
  note: string | null | undefined,
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<StockItemDto> => {
  if (quantityAdded <= 0) {
    throw new BadRequestError('Restock quantity must be greater than zero.', 'INVALID_QUANTITY');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.stockItem.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundError('Stock item not found.', 'STOCK_ITEM_NOT_FOUND');
    }

    const previousQuantity = current.currentQuantity;
    const newQuantity = previousQuantity + quantityAdded;

    const item = await tx.stockItem.update({
      where: { id },
      data: { currentQuantity: newQuantity },
      include: {
        _count: { select: { menuItems: true } }
      }
    });

    await tx.inventoryMovement.create({
      data: {
        stockItemId: id,
        quantityChange: quantityAdded,
        previousQuantity,
        newQuantity,
        type: 'MANUAL_RESTOCK',
        performedById: staffId,
        note: note ? note.trim() : 'Manual Restock'
      }
    });

    return item;
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'INVENTORY_RESTOCKED',
    entityType: 'StockItem',
    entityId: id,
    metadata: {
      name: updated.name,
      quantityAdded,
      previousQuantity: updated.currentQuantity - quantityAdded,
      newQuantity: updated.currentQuantity,
      note
    },
    ipAddress
  });

  // Broadcast real-time stock update
  const io = getIO();
  if (io) {
    io.to('staff:admin').to('staff:counter').emit('STOCK_UPDATED', {
      stockItemId: updated.id,
      name: updated.name,
      currentQuantity: updated.currentQuantity,
      lowStockThreshold: updated.lowStockThreshold
    });
  }

  return sanitizeStockItem(updated);
};

/**
 * Adjust stock quantity (Waste, breakage, discrepancy correction)
 * Mandatory reason required for auditing.
 */
export const adjustStockItem = async (
  id: string,
  quantityChange: number,
  reason: string,
  staffId: string,
  role: Role,
  ipAddress?: string
): Promise<StockItemDto> => {
  if (quantityChange === 0) {
    throw new BadRequestError('Adjustment quantity cannot be zero.', 'INVALID_QUANTITY');
  }

  if (!reason || !reason.trim()) {
    throw new BadRequestError('A reason is mandatory for manual stock adjustments.', 'REASON_REQUIRED');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.stockItem.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundError('Stock item not found.', 'STOCK_ITEM_NOT_FOUND');
    }

    const previousQuantity = current.currentQuantity;
    const newQuantity = previousQuantity + quantityChange;

    if (newQuantity < 0) {
      throw new BadRequestError(
        `Adjustment would result in negative stock (${newQuantity} ${current.unit}). Current balance is ${previousQuantity} ${current.unit}.`,
        'NEGATIVE_STOCK_DISALLOWED'
      );
    }

    const item = await tx.stockItem.update({
      where: { id },
      data: { currentQuantity: newQuantity },
      include: {
        _count: { select: { menuItems: true } }
      }
    });

    await tx.inventoryMovement.create({
      data: {
        stockItemId: id,
        quantityChange,
        previousQuantity,
        newQuantity,
        type: 'MANUAL_ADJUSTMENT',
        performedById: staffId,
        note: reason.trim()
      }
    });

    return item;
  });

  await logAudit({
    actorId: staffId,
    actorRole: role,
    action: 'INVENTORY_ADJUSTED',
    entityType: 'StockItem',
    entityId: id,
    metadata: {
      name: updated.name,
      quantityChange,
      previousQuantity: updated.currentQuantity - quantityChange,
      newQuantity: updated.currentQuantity,
      reason: reason.trim()
    },
    ipAddress
  });

  // Broadcast real-time stock update
  const io = getIO();
  if (io) {
    io.to('staff:admin').to('staff:counter').emit('STOCK_UPDATED', {
      stockItemId: updated.id,
      name: updated.name,
      currentQuantity: updated.currentQuantity,
      lowStockThreshold: updated.lowStockThreshold
    });

    if (updated.currentQuantity <= updated.lowStockThreshold) {
      io.to('staff:admin').to('staff:counter').emit('STOCK_LOW_ALERT', {
        stockItemId: updated.id,
        name: updated.name,
        currentQuantity: updated.currentQuantity,
        lowStockThreshold: updated.lowStockThreshold
      });
    }
  }

  return sanitizeStockItem(updated);
};

/**
 * List paginated inventory movements (Ledger)
 */
export const listInventoryMovements = async (filters?: {
  stockItemId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ movements: InventoryMovementDto[]; total: number }> => {
  const where: any = {};

  if (filters?.stockItemId) {
    where.stockItemId = filters.stockItemId;
  }

  if (filters?.type) {
    where.type = filters.type;
  }

  const limit = Math.min(100, Math.max(1, filters?.limit || 50));
  const offset = Math.max(0, filters?.offset || 0);

  const [total, movements] = await prisma.$transaction([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        stockItem: { select: { name: true } },
        performedBy: { select: { name: true, role: true } },
        order: { select: { dailyOrderNumber: true } }
      }
    })
  ]);

  return {
    movements: movements.map(sanitizeMovement),
    total
  };
};
