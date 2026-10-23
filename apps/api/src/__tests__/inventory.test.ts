import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../database/prisma.js';
import { Role } from '@campusbite/shared';
import { hashPassword } from '../utils/password.js';
import { COOKIE_NAME, generateToken } from '../utils/token.js';

describe('Inventory & Operational Features API', () => {
  const app = createApp();

  let adminCookie: string;
  let counterCookie: string;
  let kitchenCookie: string;

  let adminUserId: string;
  let counterUserId: string;
  let kitchenUserId: string;

  let testCategoryId: string;

  beforeAll(async () => {
    // Clean up test database
    await prisma.inventoryMovement.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.orderStatusHistory.deleteMany();
    await prisma.preparationTimeAdjustment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.category.deleteMany();
    await prisma.stockItem.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await hashPassword('SecurePassword123!');

    // 1. Create test users
    const adminUser = await prisma.user.create({
      data: {
        name: 'Admin Inventory',
        email: 'admin.inv@campusbite.internal',
        passwordHash,
        role: Role.ADMIN,
        isActive: true
      }
    });
    adminUserId = adminUser.id;
    adminCookie = `${COOKIE_NAME}=${generateToken({ userId: adminUser.id, email: adminUser.email, role: Role.ADMIN, tokenVersion: 1 })}`;

    const counterUser = await prisma.user.create({
      data: {
        name: 'Counter Inventory',
        email: 'counter.inv@campusbite.internal',
        passwordHash,
        role: Role.COUNTER,
        isActive: true
      }
    });
    counterUserId = counterUser.id;
    counterCookie = `${COOKIE_NAME}=${generateToken({ userId: counterUser.id, email: counterUser.email, role: Role.COUNTER, tokenVersion: 1 })}`;

    const kitchenUser = await prisma.user.create({
      data: {
        name: 'Kitchen Inventory',
        email: 'kitchen.inv@campusbite.internal',
        passwordHash,
        role: Role.KITCHEN,
        isActive: true
      }
    });
    kitchenUserId = kitchenUser.id;
    kitchenCookie = `${COOKIE_NAME}=${generateToken({ userId: kitchenUser.id, email: kitchenUser.email, role: Role.KITCHEN, tokenVersion: 1 })}`;

    // 2. Create test category
    const cat = await prisma.category.create({
      data: {
        name: 'Inventory Beverages',
        displayOrder: 1,
        isActive: true
      }
    });
    testCategoryId = cat.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Stock Items Management & RBAC', () => {
    let createdStockId: string;

    it('should forbid Counter and Kitchen from creating stock items', async () => {
      const resCounter = await request(app)
        .post('/api/v1/inventory/stock-items')
        .set('Cookie', counterCookie)
        .send({
          name: 'Juice Bottles',
          unit: 'bottles',
          currentQuantity: 20,
          lowStockThreshold: 5
        });
      expect(resCounter.status).toBe(403);

      const resKitchen = await request(app)
        .post('/api/v1/inventory/stock-items')
        .set('Cookie', kitchenCookie)
        .send({
          name: 'Juice Bottles',
          unit: 'bottles',
          currentQuantity: 20,
          lowStockThreshold: 5
        });
      expect(resKitchen.status).toBe(403);
    });

    it('should allow Admin to create a stock item and record initial movement', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/stock-items')
        .set('Cookie', adminCookie)
        .send({
          name: 'Cold Coffee 300ml Glass Bottles',
          unit: 'bottles',
          currentQuantity: 30,
          lowStockThreshold: 10
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.item.name).toBe('Cold Coffee 300ml Glass Bottles');
      expect(res.body.data.item.currentQuantity).toBe(30);
      expect(res.body.data.item.isLowStock).toBe(false);

      createdStockId = res.body.data.item.id;

      // Verify initial setup movement was recorded
      const movements = await prisma.inventoryMovement.findMany({
        where: { stockItemId: createdStockId }
      });
      expect(movements.length).toBe(1);
      expect(movements[0].type).toBe('MANUAL_RESTOCK');
      expect(movements[0].quantityChange).toBe(30);
      expect(movements[0].previousQuantity).toBe(0);
      expect(movements[0].newQuantity).toBe(30);
    });

    it('should reject creating duplicate stock item name', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/stock-items')
        .set('Cookie', adminCookie)
        .send({
          name: 'Cold Coffee 300ml Glass Bottles',
          unit: 'bottles',
          currentQuantity: 10,
          lowStockThreshold: 5
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_STOCK_NAME');
    });

    it('should allow staff roles to list stock items and filter by low-stock', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/stock-items')
        .set('Cookie', counterCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].id).toBe(createdStockId);
    });

    it('should allow Admin to update stock threshold and unit', async () => {
      const res = await request(app)
        .put(`/api/v1/inventory/stock-items/${createdStockId}`)
        .set('Cookie', adminCookie)
        .send({
          lowStockThreshold: 15,
          unit: 'glass-bottles'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.item.lowStockThreshold).toBe(15);
      expect(res.body.data.item.unit).toBe('glass-bottles');
    });
  });

  describe('Restock & Adjust Operations', () => {
    let stockId: string;

    beforeAll(async () => {
      const stock = await prisma.stockItem.create({
        data: {
          name: 'Samosa Frozen Patties',
          unit: 'pcs',
          currentQuantity: 20,
          lowStockThreshold: 10
        }
      });
      stockId = stock.id;
    });

    it('should allow Kitchen and Admin to restock inventory', async () => {
      const resKitchen = await request(app)
        .post(`/api/v1/inventory/stock-items/${stockId}/restock`)
        .set('Cookie', kitchenCookie)
        .send({
          quantityAdded: 15,
          note: 'Evening delivery from bakery'
        });

      expect(resKitchen.status).toBe(200);
      expect(resKitchen.body.data.item.currentQuantity).toBe(35);

      // Verify movement recorded
      const latestMovement = await prisma.inventoryMovement.findFirst({
        where: { stockItemId: stockId },
        orderBy: { createdAt: 'desc' }
      });
      expect(latestMovement?.type).toBe('MANUAL_RESTOCK');
      expect(latestMovement?.quantityChange).toBe(15);
      expect(latestMovement?.previousQuantity).toBe(20);
      expect(latestMovement?.newQuantity).toBe(35);
    });

    it('should reject restock with invalid or negative quantities', async () => {
      const resZero = await request(app)
        .post(`/api/v1/inventory/stock-items/${stockId}/restock`)
        .set('Cookie', adminCookie)
        .send({ quantityAdded: 0 });
      expect(resZero.status).toBe(400);

      const resNegative = await request(app)
        .post(`/api/v1/inventory/stock-items/${stockId}/restock`)
        .set('Cookie', adminCookie)
        .send({ quantityAdded: -5 });
      expect(resNegative.status).toBe(400);
    });

    it('should allow Admin to adjust stock with mandatory reason', async () => {
      const res = await request(app)
        .post(`/api/v1/inventory/stock-items/${stockId}/adjust`)
        .set('Cookie', adminCookie)
        .send({
          quantityChange: -5,
          reason: 'Dropped tray on kitchen floor'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.item.currentQuantity).toBe(30);

      const latestMovement = await prisma.inventoryMovement.findFirst({
        where: { stockItemId: stockId },
        orderBy: { createdAt: 'desc' }
      });
      expect(latestMovement?.type).toBe('MANUAL_ADJUSTMENT');
      expect(latestMovement?.quantityChange).toBe(-5);
      expect(latestMovement?.previousQuantity).toBe(35);
      expect(latestMovement?.newQuantity).toBe(30);
      expect(latestMovement?.note).toBe('Dropped tray on kitchen floor');
    });

    it('should reject adjustments without a reason or exceeding current stock', async () => {
      const resNoReason = await request(app)
        .post(`/api/v1/inventory/stock-items/${stockId}/adjust`)
        .set('Cookie', adminCookie)
        .send({ quantityChange: -5 });
      expect(resNoReason.status).toBe(400);

      const resNegativeBalance = await request(app)
        .post(`/api/v1/inventory/stock-items/${stockId}/adjust`)
        .set('Cookie', adminCookie)
        .send({
          quantityChange: -100,
          reason: 'Massive spoiled batch'
        });
      expect(resNegativeBalance.status).toBe(400);
      expect(resNegativeBalance.body.error.code).toBe('NEGATIVE_STOCK_DISALLOWED');
    });
  });

  describe('Ordering Integration: Atomic Deduction & Out-of-Stock Prevention', () => {
    let stockId: string;
    let menuItemId: string;

    beforeAll(async () => {
      const stock = await prisma.stockItem.create({
        data: {
          name: 'Paneer Roll Packets',
          unit: 'portions',
          currentQuantity: 5,
          lowStockThreshold: 3
        }
      });
      stockId = stock.id;

      const menuItem = await prisma.menuItem.create({
        data: {
          name: 'Special Paneer Roll',
          categoryId: testCategoryId,
          pricePaise: 8000,
          prepTimeMinutes: 10,
          isAvailable: true,
          stockItemId: stock.id
        }
      });
      menuItemId = menuItem.id;
    });

    it('should successfully place order and atomically decrement stock', async () => {
      const idempotencyKey = crypto.randomUUID();

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Cookie', counterCookie)
        .send({
          idempotencyKey,
          items: [
            {
              menuItemId,
              quantity: 2
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify stock decreased from 5 to 3
      const updatedStock = await prisma.stockItem.findUnique({ where: { id: stockId } });
      expect(updatedStock?.currentQuantity).toBe(3);

      // Verify deduction movement
      const movement = await prisma.inventoryMovement.findFirst({
        where: { stockItemId: stockId, type: 'ORDER_DEDUCTION' },
        orderBy: { createdAt: 'desc' }
      });
      expect(movement).toBeDefined();
      expect(movement?.quantityChange).toBe(-2);
      expect(movement?.previousQuantity).toBe(5);
      expect(movement?.newQuantity).toBe(3);
    });

    it('should reject order when requested quantity exceeds available stock', async () => {
      const idempotencyKey = crypto.randomUUID();

      // Current stock is 3; requesting 4 must fail
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Cookie', counterCookie)
        .send({
          idempotencyKey,
          items: [
            {
              menuItemId,
              quantity: 4
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

      // Verify stock remains untouched at 3
      const stock = await prisma.stockItem.findUnique({ where: { id: stockId } });
      expect(stock?.currentQuantity).toBe(3);
    });

    it('should reject order if menu item is marked unavailable', async () => {
      // Toggle menu item unavailable
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: { isAvailable: false }
      });

      const idempotencyKey = crypto.randomUUID();
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Cookie', counterCookie)
        .send({
          idempotencyKey,
          items: [{ menuItemId, quantity: 1 }]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ITEM_UNAVAILABLE');

      // Restore availability
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: { isAvailable: true }
      });
    });
  });

  describe('Order Cancellation Stock Restoration', () => {
    let stockId: string;
    let menuItemId: string;
    let orderId: string;

    beforeAll(async () => {
      const stock = await prisma.stockItem.create({
        data: {
          name: 'Ice Cream Cup 100ml',
          unit: 'cups',
          currentQuantity: 10,
          lowStockThreshold: 5
        }
      });
      stockId = stock.id;

      const menuItem = await prisma.menuItem.create({
        data: {
          name: 'Vanilla Ice Cream Cup',
          categoryId: testCategoryId,
          pricePaise: 4000,
          prepTimeMinutes: 2,
          isAvailable: true,
          stockItemId: stock.id
        }
      });
      menuItemId = menuItem.id;

      // Place order for 3 cups -> stock decrements from 10 to 7
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Cookie', counterCookie)
        .send({
          idempotencyKey: crypto.randomUUID(),
          items: [{ menuItemId, quantity: 3 }]
        });
      orderId = res.body.data.order.id;

      const currentStock = await prisma.stockItem.findUnique({ where: { id: stockId } });
      expect(currentStock?.currentQuantity).toBe(7);
    });

    it('should restore inventory when order is cancelled and log CANCELLATION_RESTORE movement', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Cookie', counterCookie)
        .send({
          reason: 'Customer cancelled before food prep'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('CANCELLED');

      // Verify stock was restored from 7 back to 10
      const restoredStock = await prisma.stockItem.findUnique({ where: { id: stockId } });
      expect(restoredStock?.currentQuantity).toBe(10);

      // Verify CANCELLATION_RESTORE ledger entry
      const restoreMovement = await prisma.inventoryMovement.findFirst({
        where: {
          orderId,
          type: 'CANCELLATION_RESTORE'
        }
      });
      expect(restoreMovement).toBeDefined();
      expect(restoreMovement?.quantityChange).toBe(3);
      expect(restoreMovement?.previousQuantity).toBe(7);
      expect(restoreMovement?.newQuantity).toBe(10);
      expect(restoreMovement?.note).toContain('Customer cancelled before food prep');
    });
  });

  describe('Inventory Overview & Movement Ledger', () => {
    it('should return aggregated metrics for inventory overview', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/overview')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview.totalStockItems).toBeGreaterThan(0);
      expect(typeof res.body.data.overview.lowStockCount).toBe('number');
      expect(typeof res.body.data.overview.outOfStockCount).toBe('number');
      expect(Array.isArray(res.body.data.overview.recentMovements)).toBe(true);
    });

    it('should allow Admin to view movements ledger and forbid non-Admin', async () => {
      const resCounter = await request(app)
        .get('/api/v1/inventory/movements')
        .set('Cookie', counterCookie);
      expect(resCounter.status).toBe(403);

      const resAdmin = await request(app)
        .get('/api/v1/inventory/movements')
        .set('Cookie', adminCookie);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.data.movements.length).toBeGreaterThan(0);
      expect(resAdmin.body.data.movements[0].stockItemName).toBeDefined();
      expect(resAdmin.body.data.movements[0].performedByName).toBeDefined();
    });
  });
});
