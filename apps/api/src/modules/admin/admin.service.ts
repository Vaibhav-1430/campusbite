import { Role, ResetBusinessDataResponse, ResetBusinessDataSummary } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';

export const resetBusinessData = async (
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<ResetBusinessDataResponse> => {
  // Execute transactional deletion of operational records
  const result = await prisma.$transaction(async (tx) => {
    // 1. Snapshot counts before deletion for audit reporting
    const [
      ordersCount,
      orderItemsCount,
      statusHistoryCount,
      prepAdjustmentCount,
      orderMovementCount,
      dailySequenceCount,
      categoriesBefore,
      menuItemsBefore,
      usersBefore
    ] = await Promise.all([
      tx.order.count(),
      tx.orderItem.count(),
      tx.orderStatusHistory.count(),
      tx.preparationTimeAdjustment.count(),
      tx.inventoryMovement.count({ where: { orderId: { not: null } } }),
      tx.dailyOrderSequence.count(),
      tx.category.count(),
      tx.menuItem.count(),
      tx.user.count()
    ]);

    // 2. Perform deletions in strict foreign-key dependency order
    // Order-derived inventory movements
    await tx.inventoryMovement.deleteMany({
      where: { orderId: { not: null } }
    });

    // Preparation time adjustments
    await tx.preparationTimeAdjustment.deleteMany();

    // Order status history
    await tx.orderStatusHistory.deleteMany();

    // Order items
    await tx.orderItem.deleteMany();

    // Orders
    await tx.order.deleteMany();

    // Daily order sequence numbers
    await tx.dailyOrderSequence.deleteMany();

    // 3. Post-deletion integrity check: verify zero preserved records were modified
    const [categoriesAfter, menuItemsAfter, usersAfter] = await Promise.all([
      tx.category.count(),
      tx.menuItem.count(),
      tx.user.count()
    ]);

    if (categoriesBefore !== categoriesAfter) {
      throw new Error(
        `Integrity check failed: categories modified during reset (${categoriesBefore} -> ${categoriesAfter})`
      );
    }
    if (menuItemsBefore !== menuItemsAfter) {
      throw new Error(
        `Integrity check failed: menu items modified during reset (${menuItemsBefore} -> ${menuItemsAfter})`
      );
    }
    if (usersBefore !== usersAfter) {
      throw new Error(
        `Integrity check failed: user accounts modified during reset (${usersBefore} -> ${usersAfter})`
      );
    }

    const summary: ResetBusinessDataSummary = {
      deletedOrders: ordersCount,
      deletedOrderItems: orderItemsCount,
      deletedStatusHistories: statusHistoryCount,
      deletedPrepAdjustments: prepAdjustmentCount,
      deletedInventoryMovements: orderMovementCount,
      deletedDailySequences: dailySequenceCount,
      preservedCategories: categoriesAfter,
      preservedMenuItems: menuItemsAfter,
      preservedUsers: usersAfter
    };

    const timestamp = new Date().toISOString();

    // 4. Record audit event inside transaction
    await tx.auditLog.create({
      data: {
        actorId,
        actorRole,
        action: 'BUSINESS_DATA_RESET',
        entityType: 'System',
        entityId: 'operational_data',
        metadataJson: {
          ...summary,
          timestamp
        },
        ipAddress
      }
    });

    return { summary, timestamp };
  });

  logger.info(
    `Operational business data reset successfully executed by admin ${actorId}. ` +
      `Orders deleted: ${result.summary.deletedOrders}, items: ${result.summary.deletedOrderItems}, preserved items: ${result.summary.preservedMenuItems}`
  );

  return {
    message: 'Operational business data successfully reset while preserving menu and accounts.',
    summary: result.summary,
    timestamp: result.timestamp
  };
};
