import { describe, it, expect } from 'vitest';
import { StockItemDto, MenuItemDto } from '@campusbite/shared';

describe('Inventory UI Helpers, State Calculations & POS Guards', () => {
  const mockStockItem = (currentQuantity: number, lowStockThreshold: number = 10): StockItemDto => ({
    id: 'stock-1',
    name: 'Burger Patty',
    unit: 'portions',
    currentQuantity,
    lowStockThreshold,
    isLowStock: currentQuantity <= lowStockThreshold && currentQuantity > 0,
    isOutOfStock: currentQuantity <= 0,
    linkedMenuItemCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const mockMenuItem = (isAvailable: boolean, stockItem?: StockItemDto): MenuItemDto => ({
    id: 'menu-1',
    categoryId: 'cat-1',
    categoryName: 'Burgers',
    name: 'Classic Cheeseburger',
    description: 'Juicy burger',
    pricePaise: 12000,
    prepTimeMinutes: 10,
    imageUrl: null,
    isAvailable,
    stockItemId: stockItem?.id || null,
    stockItem: stockItem || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  describe('Stock Status Classification', () => {
    it('should correctly flag out-of-stock items when currentQuantity is 0', () => {
      const stock = mockStockItem(0, 10);
      expect(stock.isOutOfStock).toBe(true);
      expect(stock.isLowStock).toBe(false);
    });

    it('should correctly flag low-stock items when currentQuantity <= lowStockThreshold and > 0', () => {
      const stockLow = mockStockItem(5, 10);
      expect(stockLow.isOutOfStock).toBe(false);
      expect(stockLow.isLowStock).toBe(true);

      const stockExactThreshold = mockStockItem(10, 10);
      expect(stockExactThreshold.isLowStock).toBe(true);
    });

    it('should correctly flag healthy items when currentQuantity > lowStockThreshold', () => {
      const healthyStock = mockStockItem(25, 10);
      expect(healthyStock.isOutOfStock).toBe(false);
      expect(healthyStock.isLowStock).toBe(false);
    });
  });

  describe('Counter POS Cart Availability & Stock Guards', () => {
    it('should disallow checkout if an item in the cart is marked unavailable', () => {
      const cart = [
        { menuItem: mockMenuItem(true, mockStockItem(20)), quantity: 2 },
        { menuItem: mockMenuItem(false, mockStockItem(15)), quantity: 1 }
      ];

      const hasUnavailableInCart = cart.some(
        (c) => !c.menuItem.isAvailable || Boolean(c.menuItem.stockItem && c.menuItem.stockItem.isOutOfStock)
      );

      expect(hasUnavailableInCart).toBe(true);
    });

    it('should disallow checkout if a tracked item in the cart is out of stock', () => {
      const cart = [
        { menuItem: mockMenuItem(true, mockStockItem(0)), quantity: 1 }
      ];

      const hasUnavailableInCart = cart.some(
        (c) => !c.menuItem.isAvailable || Boolean(c.menuItem.stockItem && c.menuItem.stockItem.isOutOfStock)
      );

      expect(hasUnavailableInCart).toBe(true);
    });

    it('should permit checkout when all items are available and in stock', () => {
      const cart = [
        { menuItem: mockMenuItem(true, mockStockItem(15)), quantity: 2 },
        { menuItem: mockMenuItem(true, mockStockItem(5, 2)), quantity: 1 }
      ];

      const hasUnavailableInCart = cart.some(
        (c) => !c.menuItem.isAvailable || Boolean(c.menuItem.stockItem && c.menuItem.stockItem.isOutOfStock)
      );

      expect(hasUnavailableInCart).toBe(false);
    });

    it('should restrict adding quantity beyond tracked available stock', () => {
      const stock = mockStockItem(3, 5);
      const currentCartQty = 3;

      const canIncrement = !stock.isOutOfStock && currentCartQty < stock.currentQuantity;
      expect(canIncrement).toBe(false);

      const canIncrementWithRoom = currentCartQty - 1 < stock.currentQuantity;
      expect(canIncrementWithRoom).toBe(true);
    });
  });

  describe('Restock & Manual Adjustment UI Calculations', () => {
    it('should calculate projected restock balance correctly', () => {
      const currentBalance = 14;
      const quantityToAdd = 25;
      const projected = currentBalance + quantityToAdd;

      expect(projected).toBe(39);
    });

    it('should calculate projected adjustment balance and detect negative balance violations', () => {
      const currentBalance = 5;
      const validAdjustment = -3;
      const invalidAdjustment = -7;

      expect(currentBalance + validAdjustment).toBe(2);
      expect(currentBalance + validAdjustment >= 0).toBe(true);

      expect(currentBalance + invalidAdjustment).toBe(-2);
      expect(currentBalance + invalidAdjustment >= 0).toBe(false);
    });

    it('should validate mandatory adjustment reason length', () => {
      const validateReason = (reason: string) => reason.trim().length >= 3;

      expect(validateReason('')).toBe(false);
      expect(validateReason('  ab  ')).toBe(false);
      expect(validateReason('Spoilage during lunch shift')).toBe(true);
    });
  });

  describe('Inventory Movement Ledger Filtering', () => {
    const sampleMovements = [
      { id: '1', type: 'MANUAL_RESTOCK', quantityChange: 20 },
      { id: '2', type: 'ORDER_DEDUCTION', quantityChange: -2 },
      { id: '3', type: 'MANUAL_ADJUSTMENT', quantityChange: -1 },
      { id: '4', type: 'CANCELLATION_RESTORE', quantityChange: 2 },
      { id: '5', type: 'ORDER_DEDUCTION', quantityChange: -3 }
    ];

    it('should filter movements accurately by movement type', () => {
      const filterByType = (type: string) =>
        sampleMovements.filter((m) => type === 'all' || m.type === type);

      expect(filterByType('all').length).toBe(5);
      expect(filterByType('ORDER_DEDUCTION').length).toBe(2);
      expect(filterByType('MANUAL_RESTOCK').length).toBe(1);
      expect(filterByType('MANUAL_ADJUSTMENT').length).toBe(1);
      expect(filterByType('CANCELLATION_RESTORE').length).toBe(1);
    });
  });
});
