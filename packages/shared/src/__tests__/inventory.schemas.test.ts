import { describe, it, expect } from 'vitest';
import {
  createStockItemSchema,
  updateStockItemSchema,
  restockStockItemSchema,
  adjustStockItemSchema
} from '../schemas/inventory.schemas.js';

describe('Inventory Schemas Validation', () => {
  describe('createStockItemSchema', () => {
    it('should validate valid stock item creation payload', () => {
      const valid = {
        name: 'Cold Coffee 300ml Bottles',
        unit: 'bottles',
        currentQuantity: 50,
        lowStockThreshold: 15
      };
      const result = createStockItemSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty or too short stock item name', () => {
      expect(createStockItemSchema.safeParse({ name: ' ', unit: 'pcs' }).success).toBe(false);
      expect(createStockItemSchema.safeParse({ name: 'A', unit: 'pcs' }).success).toBe(false);
    });

    it('should reject negative quantity and negative threshold', () => {
      expect(
        createStockItemSchema.safeParse({
          name: 'Burger Buns',
          unit: 'pcs',
          currentQuantity: -5,
          lowStockThreshold: 10
        }).success
      ).toBe(false);

      expect(
        createStockItemSchema.safeParse({
          name: 'Burger Buns',
          unit: 'pcs',
          currentQuantity: 10,
          lowStockThreshold: -1
        }).success
      ).toBe(false);
    });

    it('should apply sensible defaults', () => {
      const result = createStockItemSchema.safeParse({
        name: 'Samosa Portions'
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.unit).toBe('portions');
        expect(result.data.currentQuantity).toBe(0);
        expect(result.data.lowStockThreshold).toBe(10);
      }
    });
  });

  describe('updateStockItemSchema', () => {
    it('should allow partial updates', () => {
      expect(updateStockItemSchema.safeParse({ lowStockThreshold: 20 }).success).toBe(true);
      expect(updateStockItemSchema.safeParse({ name: 'Fresh Buns' }).success).toBe(true);
      expect(updateStockItemSchema.safeParse({ unit: 'kg' }).success).toBe(true);
    });

    it('should reject negative threshold update', () => {
      expect(updateStockItemSchema.safeParse({ lowStockThreshold: -5 }).success).toBe(false);
    });
  });

  describe('restockStockItemSchema', () => {
    it('should accept positive restock quantities', () => {
      expect(restockStockItemSchema.safeParse({ quantityAdded: 25 }).success).toBe(true);
      expect(
        restockStockItemSchema.safeParse({ quantityAdded: 100, note: 'Invoice #INV-2026-99' }).success
      ).toBe(true);
    });

    it('should reject zero or negative restock quantities', () => {
      expect(restockStockItemSchema.safeParse({ quantityAdded: 0 }).success).toBe(false);
      expect(restockStockItemSchema.safeParse({ quantityAdded: -10 }).success).toBe(false);
    });
  });

  describe('adjustStockItemSchema', () => {
    it('should accept valid positive and negative quantity adjustments with reason', () => {
      expect(
        adjustStockItemSchema.safeParse({
          quantityChange: -3,
          reason: 'Dropped on floor / waste'
        }).success
      ).toBe(true);

      expect(
        adjustStockItemSchema.safeParse({
          quantityChange: 5,
          reason: 'Inventory count correction'
        }).success
      ).toBe(true);
    });

    it('should reject zero adjustment', () => {
      expect(
        adjustStockItemSchema.safeParse({
          quantityChange: 0,
          reason: 'No change'
        }).success
      ).toBe(false);
    });

    it('should reject empty or missing reason', () => {
      expect(
        adjustStockItemSchema.safeParse({
          quantityChange: -2,
          reason: ''
        }).success
      ).toBe(false);

      expect(
        adjustStockItemSchema.safeParse({
          quantityChange: -2
        }).success
      ).toBe(false);
    });
  });
});
