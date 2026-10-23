export type InventoryMovementTypeString =
  | 'ORDER_DEDUCTION'
  | 'CANCELLATION_RESTORE'
  | 'MANUAL_RESTOCK'
  | 'MANUAL_ADJUSTMENT';

export interface StockItemDto {
  id: string;
  name: string;
  unit: string;
  currentQuantity: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  linkedMenuItemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovementDto {
  id: string;
  stockItemId: string;
  stockItemName: string;
  quantityChange: number;
  previousQuantity: number | null;
  newQuantity: number | null;
  type: InventoryMovementTypeString;
  orderId: string | null;
  orderNumber: string | null;
  performedById: string;
  performedByName: string;
  performedByRole: string;
  note: string | null;
  createdAt: string;
}

export interface InventoryOverviewDto {
  totalStockItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  healthyStockCount: number;
  recentMovements: InventoryMovementDto[];
}
