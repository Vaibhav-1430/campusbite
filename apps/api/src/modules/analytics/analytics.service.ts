import { prisma } from '../../database/prisma.js';
import {
  OrderStatus,
  SalesSummaryDto,
  DailySalesTrendDto,
  MenuItemPerformanceDto,
  KitchenPerformanceDto,
  InventoryReportDto,
  DailyClosingReportDto,
  generateCsv
} from '@campusbite/shared';

export function parseDateRange(startDateStr: string, endDateStr: string): { start: Date; end: Date } {
  const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);

  const start = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));

  return { start, end };
}

export function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 1. Sales & Order Analytics
 */
export async function getSalesSummary(startDateStr: string, endDateStr: string): Promise<SalesSummaryDto> {
  const { start, end } = parseDateRange(startDateStr, endDateStr);

  const orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end
      }
    },
    select: {
      id: true,
      dailyOrderNumber: true,
      status: true,
      totalPaise: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  });

  let totalOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let activeOrders = 0;

  let grossSalesPaise = 0;
  let completedSalesPaise = 0;
  let cancelledSalesPaise = 0;

  const dailyMap = new Map<string, DailySalesTrendDto>();

  // Initialize all days in the range so zero-order days are clearly visible
  const curr = new Date(start.getTime());
  while (curr <= end) {
    const key = formatDateKey(curr);
    dailyMap.set(key, {
      date: key,
      totalOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      grossSalesPaise: 0,
      completedSalesPaise: 0
    });
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  for (const ord of orders) {
    totalOrders += 1;
    grossSalesPaise += ord.totalPaise;

    const dateKey = formatDateKey(ord.createdAt);
    const dayRecord = dailyMap.get(dateKey) || {
      date: dateKey,
      totalOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      grossSalesPaise: 0,
      completedSalesPaise: 0
    };

    dayRecord.totalOrders += 1;
    dayRecord.grossSalesPaise += ord.totalPaise;

    if (ord.status === OrderStatus.COMPLETED) {
      completedOrders += 1;
      completedSalesPaise += ord.totalPaise;
      dayRecord.completedOrders += 1;
      dayRecord.completedSalesPaise += ord.totalPaise;
    } else if (ord.status === OrderStatus.CANCELLED) {
      cancelledOrders += 1;
      cancelledSalesPaise += ord.totalPaise;
      dayRecord.cancelledOrders += 1;
    } else {
      activeOrders += 1;
    }

    dailyMap.set(dateKey, dayRecord);
  }

  const averageOrderValuePaise =
    completedOrders > 0 ? Math.round(completedSalesPaise / completedOrders) : 0;

  const dailyTrends = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    totalOrders,
    completedOrders,
    cancelledOrders,
    activeOrders,
    grossSalesPaise,
    completedSalesPaise,
    cancelledSalesPaise,
    averageOrderValuePaise,
    dailyTrends
  };
}

/**
 * 2. Menu Item Performance Analytics
 */
export async function getMenuPerformance(startDateStr: string, endDateStr: string): Promise<MenuItemPerformanceDto[]> {
  const { start, end } = parseDateRange(startDateStr, endDateStr);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        createdAt: {
          gte: start,
          lte: end
        }
      }
    },
    select: {
      menuItemId: true,
      nameSnapshot: true,
      quantity: true,
      subtotalPaise: true,
      order: {
        select: {
          status: true
        }
      },
      menuItem: {
        select: {
          name: true,
          category: {
            select: { name: true }
          }
        }
      }
    }
  });

  const performanceMap = new Map<string, {
    menuItemId: string;
    name: string;
    categoryName: string;
    quantityOrdered: number;
    quantityFulfilled: number;
    quantityCancelled: number;
    totalRevenuePaise: number;
  }>();

  for (const item of orderItems) {
    const key = item.menuItemId;
    const existing = performanceMap.get(key) || {
      menuItemId: item.menuItemId,
      name: item.menuItem?.name || item.nameSnapshot,
      categoryName: item.menuItem?.category?.name || 'Uncategorized',
      quantityOrdered: 0,
      quantityFulfilled: 0,
      quantityCancelled: 0,
      totalRevenuePaise: 0
    };

    existing.quantityOrdered += item.quantity;

    if (item.order.status === OrderStatus.COMPLETED) {
      existing.quantityFulfilled += item.quantity;
      existing.totalRevenuePaise += item.subtotalPaise;
    } else if (item.order.status === OrderStatus.CANCELLED) {
      existing.quantityCancelled += item.quantity;
    }

    performanceMap.set(key, existing);
  }

  const results: MenuItemPerformanceDto[] = Array.from(performanceMap.values()).map((item) => {
    const cancellationRatePercent =
      item.quantityOrdered > 0
        ? Math.round((item.quantityCancelled / item.quantityOrdered) * 1000) / 10
        : 0;

    return {
      ...item,
      cancellationRatePercent
    };
  });

  // Sort primarily by fulfilled quantity descending, then by total revenue descending
  results.sort((a, b) => b.quantityFulfilled - a.quantityFulfilled || b.totalRevenuePaise - a.totalRevenuePaise);

  return results;
}

/**
 * 3. Kitchen Preparation Performance
 */
export async function getKitchenPerformance(startDateStr: string, endDateStr: string): Promise<KitchenPerformanceDto> {
  const { start, end } = parseDateRange(startDateStr, endDateStr);

  const preparedOrders = await prisma.order.findMany({
    where: {
      preparedAt: {
        gte: start,
        lte: end
      },
      preparationStartedAt: {
        not: null
      }
    },
    select: {
      id: true,
      initialEstimatedMinutes: true,
      preparationStartedAt: true,
      estimatedCompletionAt: true,
      preparedAt: true
    }
  });

  let totalPreparedOrders = 0;
  let totalActualMinutes = 0;
  let totalEstimatedMinutes = 0;
  let onTimeOrdersCount = 0;
  let delayedOrdersCount = 0;
  let totalDelayMinutes = 0;

  for (const ord of preparedOrders) {
    if (!ord.preparationStartedAt || !ord.preparedAt) continue;

    const actualDurationMinutes =
      (ord.preparedAt.getTime() - ord.preparationStartedAt.getTime()) / (1000 * 60);

    // Skip corrupted or invalid negative timestamps
    if (actualDurationMinutes < 0) continue;

    totalPreparedOrders += 1;
    totalActualMinutes += actualDurationMinutes;
    totalEstimatedMinutes += ord.initialEstimatedMinutes;

    // Check delay: whether actual duration exceeded initial estimate,
    // or preparedAt was after estimatedCompletionAt (accounting for kitchen adjustments)
    const deadline = ord.estimatedCompletionAt
      ? ord.estimatedCompletionAt.getTime()
      : ord.preparationStartedAt.getTime() + ord.initialEstimatedMinutes * 60000;

    if (ord.preparedAt.getTime() <= deadline) {
      onTimeOrdersCount += 1;
    } else {
      delayedOrdersCount += 1;
      const delayMinutes = (ord.preparedAt.getTime() - deadline) / (1000 * 60);
      totalDelayMinutes += Math.max(0, delayMinutes);
    }
  }

  const averageActualPrepMinutes =
    totalPreparedOrders > 0 ? Math.round((totalActualMinutes / totalPreparedOrders) * 10) / 10 : 0;
  const averageEstimatedPrepMinutes =
    totalPreparedOrders > 0 ? Math.round((totalEstimatedMinutes / totalPreparedOrders) * 10) / 10 : 0;
  const onTimePercentage =
    totalPreparedOrders > 0 ? Math.round((onTimeOrdersCount / totalPreparedOrders) * 1000) / 10 : 100;
  const averageDelayMinutes =
    delayedOrdersCount > 0 ? Math.round((totalDelayMinutes / delayedOrdersCount) * 10) / 10 : 0;

  return {
    totalPreparedOrders,
    averageActualPrepMinutes,
    averageEstimatedPrepMinutes,
    onTimeOrdersCount,
    delayedOrdersCount,
    onTimePercentage,
    averageDelayMinutes
  };
}

/**
 * 4. Inventory & Movement Reports
 */
export async function getInventoryReport(startDateStr: string, endDateStr: string): Promise<InventoryReportDto> {
  const { start, end } = parseDateRange(startDateStr, endDateStr);

  const [movements, stockItems] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      },
      select: {
        stockItemId: true,
        quantityChange: true,
        type: true,
        stockItem: {
          select: {
            name: true,
            unit: true,
            currentQuantity: true,
            lowStockThreshold: true
          }
        }
      }
    }),
    prisma.stockItem.findMany({
      select: {
        id: true,
        name: true,
        unit: true,
        currentQuantity: true,
        lowStockThreshold: true
      },
      orderBy: { name: 'asc' }
    })
  ]);

  let totalRestockedUnits = 0;
  let totalAdjustedUnits = 0;
  let totalWastedUnits = 0;
  let totalDeductedUnits = 0;
  let totalRestoredUnits = 0;

  const itemMap = new Map<string, {
    stockItemId: string;
    name: string;
    unit: string;
    currentQuantity: number;
    lowStockThreshold: number;
    restockedUnits: number;
    wastedUnits: number;
    adjustedUnits: number;
    deductedUnits: number;
    restoredUnits: number;
  }>();

  // Seed with all current stock items so un-moved items still appear in inventory ledger
  for (const s of stockItems) {
    itemMap.set(s.id, {
      stockItemId: s.id,
      name: s.name,
      unit: s.unit,
      currentQuantity: s.currentQuantity,
      lowStockThreshold: s.lowStockThreshold,
      restockedUnits: 0,
      wastedUnits: 0,
      adjustedUnits: 0,
      deductedUnits: 0,
      restoredUnits: 0
    });
  }

  for (const m of movements) {
    const item = itemMap.get(m.stockItemId) || {
      stockItemId: m.stockItemId,
      name: m.stockItem?.name || 'Unknown',
      unit: m.stockItem?.unit || 'units',
      currentQuantity: m.stockItem?.currentQuantity || 0,
      lowStockThreshold: m.stockItem?.lowStockThreshold || 10,
      restockedUnits: 0,
      wastedUnits: 0,
      adjustedUnits: 0,
      deductedUnits: 0,
      restoredUnits: 0
    };

    if (m.type === 'MANUAL_RESTOCK') {
      totalRestockedUnits += m.quantityChange;
      item.restockedUnits += m.quantityChange;
    } else if (m.type === 'MANUAL_ADJUSTMENT') {
      totalAdjustedUnits += m.quantityChange;
      item.adjustedUnits += m.quantityChange;
      if (m.quantityChange < 0) {
        const waste = Math.abs(m.quantityChange);
        totalWastedUnits += waste;
        item.wastedUnits += waste;
      }
    } else if (m.type === 'ORDER_DEDUCTION') {
      const deduction = Math.abs(m.quantityChange);
      totalDeductedUnits += deduction;
      item.deductedUnits += deduction;
    } else if (m.type === 'CANCELLATION_RESTORE') {
      totalRestoredUnits += m.quantityChange;
      item.restoredUnits += m.quantityChange;
    }

    itemMap.set(m.stockItemId, item);
  }

  let currentLowStockCount = 0;
  let currentOutOfStockCount = 0;
  let currentHealthyStockCount = 0;

  for (const s of stockItems) {
    if (s.currentQuantity <= 0) {
      currentOutOfStockCount += 1;
    } else if (s.currentQuantity <= s.lowStockThreshold) {
      currentLowStockCount += 1;
    } else {
      currentHealthyStockCount += 1;
    }
  }

  return {
    totalRestockedUnits,
    totalAdjustedUnits,
    totalWastedUnits,
    totalDeductedUnits,
    totalRestoredUnits,
    currentLowStockCount,
    currentOutOfStockCount,
    currentHealthyStockCount,
    itemSummaries: Array.from(itemMap.values())
  };
}

/**
 * 5. Daily Closing Register Report
 */
export async function getDailyClosingReport(dateStr?: string): Promise<DailyClosingReportDto> {
  const targetDateStr = dateStr || formatDateKey(new Date());
  const { start, end } = parseDateRange(targetDateStr, targetDateStr);

  const [orders, movements] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      },
      include: {
        items: true
      },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.inventoryMovement.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      },
      include: {
        stockItem: {
          select: { name: true, unit: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  let totalPlaced = 0;
  let completed = 0;
  let cancelled = 0;
  let active = 0;

  let grossRecordedPaise = 0;
  let completedSalesPaise = 0;
  let cancelledSalesPaise = 0;

  let ordersPrepared = 0;
  let totalActualPrepMinutes = 0;
  let delayedOrders = 0;

  const topItemsMap = new Map<string, { name: string; quantityFulfilled: number; totalRevenuePaise: number }>();

  for (const ord of orders) {
    totalPlaced += 1;
    grossRecordedPaise += ord.totalPaise;

    if (ord.status === OrderStatus.COMPLETED) {
      completed += 1;
      completedSalesPaise += ord.totalPaise;

      for (const itm of ord.items) {
        const existing = topItemsMap.get(itm.menuItemId) || {
          name: itm.nameSnapshot,
          quantityFulfilled: 0,
          totalRevenuePaise: 0
        };
        existing.quantityFulfilled += itm.quantity;
        existing.totalRevenuePaise += itm.subtotalPaise;
        topItemsMap.set(itm.menuItemId, existing);
      }
    } else if (ord.status === OrderStatus.CANCELLED) {
      cancelled += 1;
      cancelledSalesPaise += ord.totalPaise;
    } else {
      active += 1;
    }

    if (ord.preparedAt && ord.preparationStartedAt) {
      const actualMinutes = (ord.preparedAt.getTime() - ord.preparationStartedAt.getTime()) / (1000 * 60);
      if (actualMinutes >= 0) {
        ordersPrepared += 1;
        totalActualPrepMinutes += actualMinutes;

        const deadline = ord.estimatedCompletionAt
          ? ord.estimatedCompletionAt.getTime()
          : ord.preparationStartedAt.getTime() + ord.initialEstimatedMinutes * 60000;

        if (ord.preparedAt.getTime() > deadline) {
          delayedOrders += 1;
        }
      }
    }
  }

  const averageOrderValuePaise = completed > 0 ? Math.round(completedSalesPaise / completed) : 0;
  const averagePrepMinutes = ordersPrepared > 0 ? Math.round((totalActualPrepMinutes / ordersPrepared) * 10) / 10 : 0;

  const topSellingItems = Array.from(topItemsMap.values())
    .sort((a, b) => b.quantityFulfilled - a.quantityFulfilled || b.totalRevenuePaise - a.totalRevenuePaise)
    .slice(0, 5);

  let restockedUnits = 0;
  let wastedUnits = 0;
  let restoredUnits = 0;
  let deductedUnits = 0;
  const restockNotes: Array<{ stockItemName: string; quantity: number; note: string | null }> = [];
  const wasteNotes: Array<{ stockItemName: string; quantity: number; reason: string }> = [];

  for (const m of movements) {
    const itemName = m.stockItem?.name || 'Unknown Item';

    if (m.type === 'MANUAL_RESTOCK') {
      restockedUnits += m.quantityChange;
      restockNotes.push({
        stockItemName: itemName,
        quantity: m.quantityChange,
        note: m.note
      });
    } else if (m.type === 'MANUAL_ADJUSTMENT' && m.quantityChange < 0) {
      const waste = Math.abs(m.quantityChange);
      wastedUnits += waste;
      wasteNotes.push({
        stockItemName: itemName,
        quantity: waste,
        reason: m.note || 'Waste / adjustment'
      });
    } else if (m.type === 'ORDER_DEDUCTION') {
      deductedUnits += Math.abs(m.quantityChange);
    } else if (m.type === 'CANCELLATION_RESTORE') {
      restoredUnits += m.quantityChange;
    }
  }

  return {
    reportDate: targetDateStr,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    generatedAt: new Date().toISOString(),
    orders: {
      totalPlaced,
      completed,
      cancelled,
      active
    },
    financials: {
      grossRecordedPaise,
      completedSalesPaise,
      cancelledSalesPaise,
      averageOrderValuePaise,
      cancelledOrderTreatment:
        'Cancelled tickets are tracked in gross volume and audit history, but strictly deducted from completed sales revenue.'
    },
    topSellingItems,
    kitchen: {
      ordersPrepared,
      averagePrepMinutes,
      delayedOrders
    },
    inventory: {
      restockedUnits,
      wastedUnits,
      restoredUnits,
      deductedUnits,
      restockNotes,
      wasteNotes
    }
  };
}

/**
 * 6. CSV Export Generators
 */
export async function exportSalesSummaryCsv(startDateStr: string, endDateStr: string): Promise<string> {
  const summary = await getSalesSummary(startDateStr, endDateStr);

  const headers = [
    'Date',
    'Total Orders Placed',
    'Completed Orders',
    'Cancelled Orders',
    'Gross Order Value (INR)',
    'Completed Sales (INR)',
    'Average Order Value (INR)'
  ];

  const rows = summary.dailyTrends.map((d) => {
    const aov = d.completedOrders > 0 ? (d.completedSalesPaise / (d.completedOrders * 100)).toFixed(2) : '0.00';
    return [
      d.date,
      d.totalOrders,
      d.completedOrders,
      d.cancelledOrders,
      (d.grossSalesPaise / 100).toFixed(2),
      (d.completedSalesPaise / 100).toFixed(2),
      aov
    ];
  });

  return generateCsv(headers, rows);
}

export async function exportMenuPerformanceCsv(startDateStr: string, endDateStr: string): Promise<string> {
  const items = await getMenuPerformance(startDateStr, endDateStr);

  const headers = [
    'Item Name',
    'Category',
    'Quantity Ordered',
    'Quantity Fulfilled',
    'Quantity Cancelled',
    'Cancellation Rate (%)',
    'Fulfilled Sales Revenue (INR)'
  ];

  const rows = items.map((i) => [
    i.name,
    i.categoryName,
    i.quantityOrdered,
    i.quantityFulfilled,
    i.quantityCancelled,
    `${i.cancellationRatePercent}%`,
    (i.totalRevenuePaise / 100).toFixed(2)
  ]);

  return generateCsv(headers, rows);
}

export async function exportDailyClosingCsv(dateStr?: string): Promise<string> {
  const closing = await getDailyClosingReport(dateStr);

  const headers = ['Category / Metric', 'Value', 'Notes / Context'];
  const rows = [
    ['Report Date', closing.reportDate, `Timezone: ${closing.timezone}`],
    ['Total Orders Placed', closing.orders.totalPlaced, 'All tickets submitted'],
    ['Completed Orders', closing.orders.completed, 'Successfully prepared and served'],
    ['Cancelled Orders', closing.orders.cancelled, 'Cancelled dining tickets'],
    ['Currently Active Orders', closing.orders.active, 'Placed / Preparing / Prepared'],
    ['Gross Recorded Value (INR)', (closing.financials.grossRecordedPaise / 100).toFixed(2), 'Total ticket gross'],
    ['Net Fulfilled Sales (INR)', (closing.financials.completedSalesPaise / 100).toFixed(2), 'Realized sales revenue'],
    ['Cancelled Value (INR)', (closing.financials.cancelledSalesPaise / 100).toFixed(2), 'Forfeited cancellation value'],
    ['Average Order Value (INR)', (closing.financials.averageOrderValuePaise / 100).toFixed(2), 'Calculated on completed orders'],
    ['Orders Prepared by Kitchen', closing.kitchen.ordersPrepared, `Avg Duration: ${closing.kitchen.averagePrepMinutes}m`],
    ['Delayed Kitchen Orders', closing.kitchen.delayedOrders, 'Actual duration > estimate'],
    ['Inventory Restocked (Units)', closing.inventory.restockedUnits, 'Logged delivery restocks'],
    ['Inventory Wasted / Spoilage (Units)', closing.inventory.wastedUnits, 'Waste and damaged goods logged'],
    ['Inventory Restored (Units)', closing.inventory.restoredUnits, 'Restored from cancelled orders'],
    ['Inventory Deducted (Units)', closing.inventory.deductedUnits, 'Order consumption']
  ];

  return generateCsv(headers, rows);
}
