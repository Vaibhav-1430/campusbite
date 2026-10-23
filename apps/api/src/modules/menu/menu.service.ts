import { CreateMenuItemInput, UpdateMenuItemInput, MenuItemDto, Role } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import { logAudit } from '../audit/audit.service.js';
import { getIO } from '../events/socket.js';

const defaultMenuInclude = {
  category: { select: { name: true } },
  stockItem: {
    select: {
      id: true,
      name: true,
      unit: true,
      currentQuantity: true,
      lowStockThreshold: true
    }
  }
};

const mapMenuItem = (item: any): MenuItemDto => ({
  id: item.id,
  categoryId: item.categoryId,
  categoryName: item.category?.name,
  name: item.name,
  description: item.description,
  pricePaise: item.pricePaise,
  prepTimeMinutes: item.prepTimeMinutes,
  imageUrl: item.imageUrl,
  isAvailable: item.isAvailable,
  stockItemId: item.stockItemId,
  stockItem: item.stockItem
    ? {
        id: item.stockItem.id,
        name: item.stockItem.name,
        unit: item.stockItem.unit,
        currentQuantity: item.stockItem.currentQuantity,
        lowStockThreshold: item.stockItem.lowStockThreshold,
        isLowStock: item.stockItem.currentQuantity <= item.stockItem.lowStockThreshold,
        isOutOfStock: item.stockItem.currentQuantity <= 0
      }
    : null,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString()
});

export interface MenuListFilters {
  categoryId?: string;
  isAvailable?: boolean;
  search?: string;
  includeInactiveCategory?: boolean;
}

export const listMenuItems = async (filters: MenuListFilters = {}): Promise<MenuItemDto[]> => {
  const where: any = {};

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.isAvailable !== undefined) {
    where.isAvailable = filters.isAvailable;
  }

  if (filters.search && filters.search.trim()) {
    where.OR = [
      { name: { contains: filters.search.trim(), mode: 'insensitive' } },
      { description: { contains: filters.search.trim(), mode: 'insensitive' } }
    ];
  }

  if (!filters.includeInactiveCategory) {
    where.category = { isActive: true };
  }

  const items = await prisma.menuItem.findMany({
    where,
    orderBy: [{ category: { displayOrder: 'asc' } }, { name: 'asc' }],
    include: defaultMenuInclude
  });

  return items.map(mapMenuItem);
};

export const getMenuItemById = async (id: string): Promise<MenuItemDto> => {
  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: defaultMenuInclude
  });

  if (!item) {
    throw new NotFoundError('Menu item not found.', 'MENU_ITEM_NOT_FOUND');
  }

  return mapMenuItem(item);
};

export const createMenuItem = async (
  input: CreateMenuItemInput,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<MenuItemDto> => {
  const category = await prisma.category.findUnique({
    where: { id: input.categoryId }
  });

  if (!category) {
    throw new BadRequestError('Referenced category does not exist.', 'INVALID_CATEGORY');
  }

  const item = await prisma.menuItem.create({
    data: {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? null,
      pricePaise: input.pricePaise,
      prepTimeMinutes: input.prepTimeMinutes ?? 10,
      imageUrl: input.imageUrl ?? null,
      isAvailable: input.isAvailable ?? true,
      stockItemId: input.stockItemId ?? null
    },
    include: defaultMenuInclude
  });

  await logAudit({
    actorId,
    actorRole,
    action: 'MENU_ITEM_CREATED',
    entityType: 'MenuItem',
    entityId: item.id,
    metadata: { name: item.name, pricePaise: item.pricePaise },
    ipAddress
  });

  return mapMenuItem(item);
};

export const updateMenuItem = async (
  id: string,
  input: UpdateMenuItemInput,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<MenuItemDto> => {
  const existing = await prisma.menuItem.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new NotFoundError('Menu item not found.', 'MENU_ITEM_NOT_FOUND');
  }

  if (input.categoryId) {
    const categoryExists = await prisma.category.findUnique({
      where: { id: input.categoryId }
    });
    if (!categoryExists) {
      throw new BadRequestError('Referenced category does not exist.', 'INVALID_CATEGORY');
    }
  }

  const updated = await prisma.menuItem.update({
    where: { id },
    data: {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.pricePaise !== undefined ? { pricePaise: input.pricePaise } : {}),
      ...(input.prepTimeMinutes !== undefined ? { prepTimeMinutes: input.prepTimeMinutes } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
      ...(input.stockItemId !== undefined ? { stockItemId: input.stockItemId } : {})
    },
    include: defaultMenuInclude
  });

  await logAudit({
    actorId,
    actorRole,
    action: 'MENU_ITEM_UPDATED',
    entityType: 'MenuItem',
    entityId: updated.id,
    metadata: {
      name: updated.name,
      oldPricePaise: existing.pricePaise,
      newPricePaise: updated.pricePaise
    },
    ipAddress
  });

  return mapMenuItem(updated);
};

export const updateAvailability = async (
  id: string,
  isAvailable: boolean,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<MenuItemDto> => {
  const existing = await prisma.menuItem.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new NotFoundError('Menu item not found.', 'MENU_ITEM_NOT_FOUND');
  }

  const updated = await prisma.menuItem.update({
    where: { id },
    data: { isAvailable },
    include: defaultMenuInclude
  });

  await logAudit({
    actorId,
    actorRole,
    action: 'MENU_AVAILABILITY_UPDATED',
    entityType: 'MenuItem',
    entityId: updated.id,
    metadata: { name: updated.name, isAvailable },
    ipAddress
  });

  // Broadcast real-time availability change to staff
  const io = getIO();
  if (io) {
    io.to('staff:counter').to('staff:kitchen').emit('MENU_AVAILABILITY_CHANGED', {
      itemId: updated.id,
      name: updated.name,
      isAvailable: updated.isAvailable
    });
  }

  return mapMenuItem(updated);
};

export const deleteMenuItem = async (
  id: string,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<void> => {
  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: { _count: { select: { orderItems: true } } }
  });

  if (!item) {
    throw new NotFoundError('Menu item not found.', 'MENU_ITEM_NOT_FOUND');
  }

  // Prevent hard deletion if item is referenced in historical orders
  if (item._count.orderItems > 0) {
    throw new BadRequestError(
      `Cannot delete menu item "${item.name}" because it is referenced in ${item._count.orderItems} existing order record(s). Toggle availability to unavailable instead.`,
      'ITEM_REFERENCED_IN_ORDERS'
    );
  }

  await prisma.menuItem.delete({
    where: { id }
  });

  await logAudit({
    actorId,
    actorRole,
    action: 'MENU_ITEM_DELETED',
    entityType: 'MenuItem',
    entityId: id,
    metadata: { name: item.name },
    ipAddress
  });
};
