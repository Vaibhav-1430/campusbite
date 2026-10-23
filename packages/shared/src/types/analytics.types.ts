export interface DailySalesTrendDto {
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  grossSalesPaise: number;
  completedSalesPaise: number;
}

export interface SalesSummaryDto {
  startDate: string;
  endDate: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  grossSalesPaise: number;
  completedSalesPaise: number;
  cancelledSalesPaise: number;
  averageOrderValuePaise: number;
  dailyTrends: DailySalesTrendDto[];
}

export interface MenuItemPerformanceDto {
  menuItemId: string;
  name: string;
  categoryName: string;
  quantityOrdered: number;
  quantityFulfilled: number;
  quantityCancelled: number;
  totalRevenuePaise: number;
  cancellationRatePercent: number;
}

export interface KitchenPerformanceDto {
  totalPreparedOrders: number;
  averageActualPrepMinutes: number;
  averageEstimatedPrepMinutes: number;
  onTimeOrdersCount: number;
  delayedOrdersCount: number;
  onTimePercentage: number;
  averageDelayMinutes: number;
}

export interface StockItemMovementSummaryDto {
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
}

export interface InventoryReportDto {
  totalRestockedUnits: number;
  totalAdjustedUnits: number;
  totalWastedUnits: number;
  totalDeductedUnits: number;
  totalRestoredUnits: number;
  currentLowStockCount: number;
  currentOutOfStockCount: number;
  currentHealthyStockCount: number;
  itemSummaries: StockItemMovementSummaryDto[];
}

export interface DailyClosingReportDto {
  reportDate: string;
  timezone: string;
  generatedAt: string;
  orders: {
    totalPlaced: number;
    completed: number;
    cancelled: number;
    active: number;
  };
  financials: {
    grossRecordedPaise: number;
    completedSalesPaise: number;
    cancelledSalesPaise: number;
    averageOrderValuePaise: number;
    cancelledOrderTreatment: string;
  };
  topSellingItems: Array<{
    name: string;
    quantityFulfilled: number;
    totalRevenuePaise: number;
  }>;
  kitchen: {
    ordersPrepared: number;
    averagePrepMinutes: number;
    delayedOrders: number;
  };
  inventory: {
    restockedUnits: number;
    wastedUnits: number;
    restoredUnits: number;
    deductedUnits: number;
    restockNotes: Array<{ stockItemName: string; quantity: number; note: string | null }>;
    wasteNotes: Array<{ stockItemName: string; quantity: number; reason: string }>;
  };
}
