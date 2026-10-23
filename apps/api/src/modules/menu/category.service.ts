import { CreateCategoryInput, UpdateCategoryInput, CategoryDto, Role } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { logAudit } from '../audit/audit.service.js';

export const listCategories = async (includeInactive = false): Promise<CategoryDto[]> => {
  const categories = await prisma.category.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: { menuItems: true }
      }
    }
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    displayOrder: c.displayOrder,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    itemCount: c._count.menuItems
  }));
};

export const createCategory = async (
  input: CreateCategoryInput,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<CategoryDto> => {
  const existing = await prisma.category.findUnique({
    where: { name: input.name }
  });

  if (existing) {
    throw new ConflictError(`Category with name "${input.name}" already exists.`, 'DUPLICATE_CATEGORY');
  }

  const category = await prisma.category.create({
    data: {
      name: input.name,
      displayOrder: input.displayOrder ?? 0,
      isActive: input.isActive ?? true
    }
  });

  await logAudit({
    actorId,
    actorRole,
    action: 'CATEGORY_CREATED',
    entityType: 'Category',
    entityId: category.id,
    metadata: { name: category.name },
    ipAddress
  });

  return {
    id: category.id,
    name: category.name,
    displayOrder: category.displayOrder,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    itemCount: 0
  };
};

export const updateCategory = async (
  id: string,
  input: UpdateCategoryInput,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<CategoryDto> => {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { menuItems: true } } }
  });

  if (!category) {
    throw new NotFoundError('Category not found.', 'CATEGORY_NOT_FOUND');
  }

  if (input.name && input.name !== category.name) {
    const duplicate = await prisma.category.findUnique({
      where: { name: input.name }
    });
    if (duplicate) {
      throw new ConflictError(`Category with name "${input.name}" already exists.`, 'DUPLICATE_CATEGORY');
    }
  }

  const updated = await prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
    }
  });

  await logAudit({
    actorId,
    actorRole,
    action: 'CATEGORY_UPDATED',
    entityType: 'Category',
    entityId: updated.id,
    metadata: { previousName: category.name, newName: updated.name },
    ipAddress
  });

  return {
    id: updated.id,
    name: updated.name,
    displayOrder: updated.displayOrder,
    isActive: updated.isActive,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    itemCount: category._count.menuItems
  };
};

export const deleteCategory = async (
  id: string,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<void> => {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { menuItems: true } } }
  });

  if (!category) {
    throw new NotFoundError('Category not found.', 'CATEGORY_NOT_FOUND');
  }

  if (category._count.menuItems > 0) {
    throw new BadRequestError(
      `Cannot delete category "${category.name}" because it contains ${category._count.menuItems} menu item(s). Reassign or delete items first.`,
      'CATEGORY_IN_USE'
    );
  }

  await prisma.category.delete({
    where: { id }
  });

  await logAudit({
    actorId,
    actorRole,
    action: 'CATEGORY_DELETED',
    entityType: 'Category',
    entityId: id,
    metadata: { name: category.name },
    ipAddress
  });
};
