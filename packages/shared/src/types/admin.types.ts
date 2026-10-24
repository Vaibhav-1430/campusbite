export interface ResetBusinessDataSummary {
  deletedOrders: number;
  deletedOrderItems: number;
  deletedStatusHistories: number;
  deletedPrepAdjustments: number;
  deletedInventoryMovements: number;
  deletedDailySequences: number;
  preservedCategories: number;
  preservedMenuItems: number;
  preservedUsers: number;
}

export interface ResetBusinessDataResponse {
  message: string;
  summary: ResetBusinessDataSummary;
  timestamp: string;
}
