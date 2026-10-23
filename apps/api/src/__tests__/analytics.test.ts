import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../database/prisma.js';
import { Role, OrderStatus } from '@campusbite/shared';
import { COOKIE_NAME, generateToken } from '../utils/token.js';
import { hashPassword } from '../utils/password.js';

describe('Phase 6 Analytics & Reporting Integration Tests', () => {
  const app = createApp();

  let adminCookie: string;
  let counterCookie: string;
  let kitchenCookie: string;

  let adminUserId: string;
  let counterUserId: string;

  let testCategoryId: string;
  let testItem1Id: string;
  let testItem2Id: string;
  let testStockItemId: string;

  beforeAll(async () => {
    // Clean test tables
    await prisma.inventoryMovement.deleteMany();
    await prisma.orderStatusHistory.deleteMany();
    await prisma.preparationTimeAdjustment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.stockItem.deleteMany();
    await prisma.category.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await hashPassword('Password123!');

    // 1. Create staff accounts
    const adminUser = await prisma.user.create({
      data: {
        name: 'Admin Analytics',
        email: 'admin.analytics@campusbite.internal',
        passwordHash,
        role: Role.ADMIN,
        isActive: true
      }
    });
    adminUserId = adminUser.id;
    adminCookie = `${COOKIE_NAME}=${generateToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: Role.ADMIN,
      tokenVersion: 1
    })}`;

    const counterUser = await prisma.user.create({
      data: {
        name: 'Counter Analytics',
        email: 'counter.analytics@campusbite.internal',
        passwordHash,
        role: Role.COUNTER,
        isActive: true
      }
    });
    counterUserId = counterUser.id;
    counterCookie = `${COOKIE_NAME}=${generateToken({
      userId: counterUser.id,
      email: counterUser.email,
      role: Role.COUNTER,
      tokenVersion: 1
    })}`;

    const kitchenUser = await prisma.user.create({
      data: {
        name: 'Kitchen Analytics',
        email: 'kitchen.analytics@campusbite.internal',
        passwordHash,
        role: Role.KITCHEN,
        isActive: true
      }
    });
    kitchenCookie = `${COOKIE_NAME}=${generateToken({
      userId: kitchenUser.id,
      email: kitchenUser.email,
      role: Role.KITCHEN,
      tokenVersion: 1
    })}`;

    // 2. Create category and stock item
    const category = await prisma.category.create({
      data: { name: 'Analytics Delights', displayOrder: 1, isActive: true }
    });
    testCategoryId = category.id;

    const stockItem = await prisma.stockItem.create({
      data: {
        name: 'Analytics Patty',
        unit: 'portions',
        currentQuantity: 50,
        lowStockThreshold: 10
      }
    });
    testStockItemId = stockItem.id;

    // 3. Create menu items
    const item1 = await prisma.menuItem.create({
      data: {
        categoryId: testCategoryId,
        name: 'Classic Burger',
        pricePaise: 10000, // ₹100
        prepTimeMinutes: 10,
        isAvailable: true,
        stockItemId: testStockItemId
      }
    });
    testItem1Id = item1.id;

    const item2 = await prisma.menuItem.create({
      data: {
        categoryId: testCategoryId,
        name: 'Iced Coffee',
        pricePaise: 5000, // ₹50
        prepTimeMinutes: 5,
        isAvailable: true
      }
    });
    testItem2Id = item2.id;

    // 4. Seed sample orders:
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    // Order 1: Completed on-time (took 8 mins vs 10 estimated)
    await prisma.order.create({
      data: {
        dailyOrderNumber: 'CB-101',
        status: OrderStatus.COMPLETED,
        totalPaise: 15000, // ₹150
        customerPinHash: 'hash',
        initialEstimatedMinutes: 10,
        preparationStartedAt: tenMinutesAgo,
        estimatedCompletionAt: now,
        preparedAt: twoMinutesAgo,
        completedAt: now,
        createdById: counterUserId,
        idempotencyKey: 'idem-1',
        items: {
          create: [
            {
              menuItemId: testItem1Id,
              nameSnapshot: 'Classic Burger',
              unitPricePaiseSnapshot: 10000,
              prepTimeMinutesSnapshot: 10,
              quantity: 1,
              subtotalPaise: 10000
            },
            {
              menuItemId: testItem2Id,
              nameSnapshot: 'Iced Coffee',
              unitPricePaiseSnapshot: 5000,
              prepTimeMinutesSnapshot: 5,
              quantity: 1,
              subtotalPaise: 5000
            }
          ]
        }
      }
    });

    // Order 2: Completed delayed (took 15 mins vs 10 estimated)
    const twentyMinsAgo = new Date(now.getTime() - 20 * 60 * 1000);
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
    await prisma.order.create({
      data: {
        dailyOrderNumber: 'CB-102',
        status: OrderStatus.COMPLETED,
        totalPaise: 10000, // ₹100
        customerPinHash: 'hash',
        initialEstimatedMinutes: 10,
        preparationStartedAt: twentyMinsAgo,
        estimatedCompletionAt: tenMinutesAgo,
        preparedAt: fiveMinsAgo, // 15 mins prep duration > 10 min estimate
        completedAt: now,
        createdById: counterUserId,
        idempotencyKey: 'idem-2',
        items: {
          create: [
            {
              menuItemId: testItem1Id,
              nameSnapshot: 'Classic Burger',
              unitPricePaiseSnapshot: 10000,
              prepTimeMinutesSnapshot: 10,
              quantity: 1,
              subtotalPaise: 10000
            }
          ]
        }
      }
    });

    // Order 3: Cancelled order (forfeited ₹50)
    await prisma.order.create({
      data: {
        dailyOrderNumber: 'CB-103',
        status: OrderStatus.CANCELLED,
        totalPaise: 5000, // ₹50
        customerPinHash: 'hash',
        initialEstimatedMinutes: 5,
        cancelledAt: now,
        cancellationReason: 'Customer changed mind',
        createdById: counterUserId,
        idempotencyKey: 'idem-3',
        items: {
          create: [
            {
              menuItemId: testItem2Id,
              nameSnapshot: 'Iced Coffee',
              unitPricePaiseSnapshot: 5000,
              prepTimeMinutesSnapshot: 5,
              quantity: 1,
              subtotalPaise: 5000
            }
          ]
        }
      }
    });

    // Order 4: Active preparing order
    await prisma.order.create({
      data: {
        dailyOrderNumber: 'CB-104',
        status: OrderStatus.PREPARING,
        totalPaise: 20000, // ₹200
        customerPinHash: 'hash',
        initialEstimatedMinutes: 10,
        preparationStartedAt: twoMinutesAgo,
        createdById: counterUserId,
        idempotencyKey: 'idem-4',
        items: {
          create: [
            {
              menuItemId: testItem1Id,
              nameSnapshot: 'Classic Burger',
              unitPricePaiseSnapshot: 10000,
              prepTimeMinutesSnapshot: 10,
              quantity: 2,
              subtotalPaise: 20000
            }
          ]
        }
      }
    });

    // 5. Seed inventory movements
    await prisma.inventoryMovement.createMany({
      data: [
        {
          stockItemId: testStockItemId,
          quantityChange: 30,
          previousQuantity: 20,
          newQuantity: 50,
          type: 'MANUAL_RESTOCK',
          performedById: adminUserId,
          note: 'Supplier delivery'
        },
        {
          stockItemId: testStockItemId,
          quantityChange: -3,
          previousQuantity: 50,
          newQuantity: 47,
          type: 'MANUAL_ADJUSTMENT',
          performedById: adminUserId,
          note: 'Expired batch waste'
        },
        {
          stockItemId: testStockItemId,
          quantityChange: -2,
          previousQuantity: 47,
          newQuantity: 45,
          type: 'ORDER_DEDUCTION',
          performedById: adminUserId,
          note: 'Deducted for orders'
        },
        {
          stockItemId: testStockItemId,
          quantityChange: 1,
          previousQuantity: 45,
          newQuantity: 46,
          type: 'CANCELLATION_RESTORE',
          performedById: adminUserId,
          note: 'Restored from cancelled order'
        }
      ]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Authorization & RBAC Access Control', () => {
    it('should reject unauthenticated requests to analytics endpoints with 401', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app).get(`/api/v1/analytics/summary?startDate=${today}&endDate=${today}`);
      expect(res.status).toBe(401);
    });

    it('should reject COUNTER staff with 403 Forbidden', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/summary?startDate=${today}&endDate=${today}`)
        .set('Cookie', counterCookie);
      expect(res.status).toBe(403);
    });

    it('should reject KITCHEN staff with 403 Forbidden', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/summary?startDate=${today}&endDate=${today}`)
        .set('Cookie', kitchenCookie);
      expect(res.status).toBe(403);
    });

    it('should grant access to authenticated ADMIN staff with 200 OK', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/summary?startDate=${today}&endDate=${today}`)
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Date Range Input Validation', () => {
    it('should reject missing startDate or endDate with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/summary')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(400);
    });

    it('should reject invalid date formats with 400', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/summary?startDate=24-10-2026&endDate=2026-10-24')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(400);
    });

    it('should reject when startDate is chronologically after endDate', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/summary?startDate=2026-10-25&endDate=2026-10-24')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.error)).toContain('Start date cannot be after end date');
    });
  });

  describe('1. Sales and Order Summary Calculations', () => {
    it('should calculate accurate order counts and distinct financial buckets', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/summary?startDate=${today}&endDate=${today}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Total orders = 4 (2 completed, 1 cancelled, 1 active preparing)
      expect(data.totalOrders).toBe(4);
      expect(data.completedOrders).toBe(2);
      expect(data.cancelledOrders).toBe(1);
      expect(data.activeOrders).toBe(1);

      // Financial calculations:
      // Gross recorded = 15000 + 10000 + 5000 + 20000 = 50000 paise (₹500)
      expect(data.grossSalesPaise).toBe(50000);
      // Completed fulfilled sales = 15000 + 10000 = 25000 paise (₹250)
      expect(data.completedSalesPaise).toBe(25000);
      // Cancelled sales = 5000 paise (₹50)
      expect(data.cancelledSalesPaise).toBe(5000);

      // Average Order Value (AOV) strictly computed on completed orders = 25000 / 2 = 12500 paise (₹125)
      expect(data.averageOrderValuePaise).toBe(12500);

      // Daily trends includes today with matching numbers
      expect(data.dailyTrends.length).toBeGreaterThanOrEqual(1);
      const todayTrend = data.dailyTrends.find((t: any) => t.date === today);
      expect(todayTrend).toBeDefined();
      expect(todayTrend.completedOrders).toBe(2);
      expect(todayTrend.completedSalesPaise).toBe(25000);
    });
  });

  describe('2. Menu Item Performance & Cancellation Impact', () => {
    it('should rank items by fulfilled quantity and calculate cancellation rate', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/menu-performance?startDate=${today}&endDate=${today}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const items = res.body.data.items;

      expect(items.length).toBeGreaterThanOrEqual(2);

      // Classic Burger:
      // Order 1 (qty 1 completed), Order 2 (qty 1 completed), Order 4 (qty 2 preparing)
      // Total ordered: 4, Total fulfilled: 2, Cancelled: 0, Revenue: 20000 paise (₹200)
      const burger = items.find((i: any) => i.name === 'Classic Burger');
      expect(burger).toBeDefined();
      expect(burger.quantityOrdered).toBe(4);
      expect(burger.quantityFulfilled).toBe(2);
      expect(burger.quantityCancelled).toBe(0);
      expect(burger.totalRevenuePaise).toBe(20000);
      expect(burger.cancellationRatePercent).toBe(0);

      // Iced Coffee:
      // Order 1 (qty 1 completed), Order 3 (qty 1 cancelled)
      // Total ordered: 2, Total fulfilled: 1, Total cancelled: 1, Revenue: 5000 paise (₹50)
      // Cancellation rate: (1 / 2) * 100 = 50%
      const coffee = items.find((i: any) => i.name === 'Iced Coffee');
      expect(coffee).toBeDefined();
      expect(coffee.quantityOrdered).toBe(2);
      expect(coffee.quantityFulfilled).toBe(1);
      expect(coffee.quantityCancelled).toBe(1);
      expect(coffee.totalRevenuePaise).toBe(5000);
      expect(coffee.cancellationRatePercent).toBe(50);
    });
  });

  describe('3. Kitchen Preparation Duration & Timeliness', () => {
    it('should compute actual durations, compare against estimate, and detect delays', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/kitchen-performance?startDate=${today}&endDate=${today}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const metrics = res.body.data;

      // 2 orders were prepared (Order 1 took 8m, Order 2 took 15m)
      expect(metrics.totalPreparedOrders).toBe(2);
      // Average duration = (8 + 15) / 2 = 11.5 minutes (approx)
      expect(metrics.averageActualPrepMinutes).toBeGreaterThan(0);
      expect(metrics.averageEstimatedPrepMinutes).toBe(10);

      // 1 order on-time (Order 1), 1 order delayed (Order 2)
      expect(metrics.onTimeOrdersCount).toBe(1);
      expect(metrics.delayedOrdersCount).toBe(1);
      expect(metrics.onTimePercentage).toBe(50);
      expect(metrics.averageDelayMinutes).toBeGreaterThan(0);
    });
  });

  describe('4. Inventory Movements & Wastage Reports', () => {
    it('should aggregate restocks, wastage, deductions, restorations, and threshold counts', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/inventory?startDate=${today}&endDate=${today}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const inv = res.body.data;

      expect(inv.totalRestockedUnits).toBe(30);
      expect(inv.totalWastedUnits).toBe(3);
      expect(inv.totalDeductedUnits).toBe(2);
      expect(inv.totalRestoredUnits).toBe(1);

      expect(inv.itemSummaries.length).toBeGreaterThanOrEqual(1);
      const patty = inv.itemSummaries.find((s: any) => s.name === 'Analytics Patty');
      expect(patty).toBeDefined();
      expect(patty.restockedUnits).toBe(30);
      expect(patty.wastedUnits).toBe(3);
      expect(patty.deductedUnits).toBe(2);
      expect(patty.restoredUnits).toBe(1);
    });
  });

  describe('5. Daily Closing Register Report', () => {
    it('should compile an idempotent daily closing snapshot with explicit cancelled treatment', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/daily-closing?date=${today}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const closing = res.body.data;

      expect(closing.reportDate).toBe(today);
      expect(closing.timezone).toBeDefined();
      expect(closing.orders.totalPlaced).toBe(4);
      expect(closing.orders.completed).toBe(2);
      expect(closing.orders.cancelled).toBe(1);

      expect(closing.financials.grossRecordedPaise).toBe(50000);
      expect(closing.financials.completedSalesPaise).toBe(25000);
      expect(closing.financials.cancelledSalesPaise).toBe(5000);
      expect(closing.financials.cancelledOrderTreatment).toContain('deducted from completed sales revenue');

      // Top selling items
      expect(closing.topSellingItems.length).toBeGreaterThan(0);
      expect(closing.topSellingItems[0].name).toBe('Classic Burger');

      // Inventory notes
      expect(closing.inventory.restockedUnits).toBe(30);
      expect(closing.inventory.wastedUnits).toBe(3);
      expect(closing.inventory.wasteNotes.length).toBe(1);
      expect(closing.inventory.wasteNotes[0].reason).toContain('Expired batch waste');
    });
  });

  describe('6. CSV Tabular Exports with Proper Escaping', () => {
    it('should export sales summary CSV with correct headers and Content-Type', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/export/sales?startDate=${today}&endDate=${today}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/csv');
      expect(res.header['content-disposition']).toContain('attachment');
      expect(res.text).toContain('Date,Total Orders Placed,Completed Orders');
      expect(res.text).toContain(today);
    });

    it('should export menu performance CSV with correct headers', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/export/menu?startDate=${today}&endDate=${today}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/csv');
      expect(res.text).toContain('Item Name,Category,Quantity Ordered,Quantity Fulfilled');
      expect(res.text).toContain('Classic Burger');
    });

    it('should export daily closing register CSV with financial metrics', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/analytics/export/daily-closing?date=${today}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/csv');
      expect(res.text).toContain('Category / Metric,Value,Notes / Context');
      expect(res.text).toContain('Net Fulfilled Sales (INR)');
      expect(res.text).toContain('250.00');
    });
  });
});
