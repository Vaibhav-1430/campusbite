import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Role, OrderStatus } from '@campusbite/shared';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { prisma } from '../database/prisma.js';

const app = createApp();

describe('Admin Business Data Reset API (POST /api/v1/admin/reset-business-data)', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('should reject unauthenticated requests with 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reset-business-data')
      .send({ confirmation: 'RESET BUSINESS DATA' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should reject non-admin users (COUNTER / KITCHEN) with 403 Forbidden', async () => {
    const { token: counterToken } = await createTestUser({ role: Role.COUNTER });
    const { token: kitchenToken } = await createTestUser({ role: Role.KITCHEN });

    const counterRes = await request(app)
      .post('/api/v1/admin/reset-business-data')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({ confirmation: 'RESET BUSINESS DATA' });

    expect(counterRes.status).toBe(403);
    expect(counterRes.body.error.code).toBe('FORBIDDEN');

    const kitchenRes = await request(app)
      .post('/api/v1/admin/reset-business-data')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ confirmation: 'RESET BUSINESS DATA' });

    expect(kitchenRes.status).toBe(403);
    expect(kitchenRes.body.error.code).toBe('FORBIDDEN');
  });

  it('should reject admin request if confirmation phrase is missing or incorrect with 400 Bad Request', async () => {
    const { token: adminToken } = await createTestUser({ role: Role.ADMIN });

    // Missing confirmation
    const resMissing = await request(app)
      .post('/api/v1/admin/reset-business-data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(resMissing.status).toBe(400);

    // Incorrect confirmation phrase
    const resWrong = await request(app)
      .post('/api/v1/admin/reset-business-data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmation: 'reset business data' }); // lowercase

    expect(resWrong.status).toBe(400);
  });

  it('should clear operational orders and derived records while strictly preserving menu items and admin accounts', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser({ role: Role.ADMIN });
    const { user: counterUser } = await createTestUser({ role: Role.COUNTER });

    // Seed Menu Category and Menu Items
    const category = await prisma.category.create({
      data: {
        name: 'Beverages',
        displayOrder: 1,
        isActive: true
      }
    });

    const item1 = await prisma.menuItem.create({
      data: {
        name: 'Darjeeling Tea',
        description: 'Authentic organic tea',
        pricePaise: 4000,
        prepTimeMinutes: 5,
        isAvailable: true,
        categoryId: category.id
      }
    });

    const item2 = await prisma.menuItem.create({
      data: {
        name: 'Cold Coffee',
        description: 'Chilled brew',
        pricePaise: 8000,
        prepTimeMinutes: 8,
        isAvailable: true,
        categoryId: category.id
      }
    });

    // Seed StockItem
    const stockItem = await prisma.stockItem.create({
      data: {
        name: 'Tea Leaves',
        unit: 'grams',
        currentQuantity: 500,
        lowStockThreshold: 50
      }
    });

    // Seed Orders with dependent OrderItems, OrderStatusHistory, PreparationTimeAdjustment, and InventoryMovement
    const order1 = await prisma.order.create({
      data: {
        dailyOrderNumber: '#101',
        idempotencyKey: 'idem-101',
        status: OrderStatus.COMPLETED,
        totalPaise: 4000,
        customerPinHash: 'hashed-pin-1',
        initialEstimatedMinutes: 5,
        createdById: counterUser.id,
        items: {
          create: {
            menuItemId: item1.id,
            nameSnapshot: item1.name,
            unitPricePaiseSnapshot: item1.pricePaise,
            prepTimeMinutesSnapshot: item1.prepTimeMinutes,
            quantity: 1,
            subtotalPaise: 4000
          }
        },
        statusHistory: {
          create: {
            newStatus: OrderStatus.COMPLETED,
            changedById: adminUser.id
          }
        },
        prepAdjustments: {
          create: {
            staffId: adminUser.id,
            minutesAdded: 2,
            previousEstimatedCompletionAt: new Date(),
            newEstimatedCompletionAt: new Date()
          }
        }
      }
    });

    // Order-derived inventory movement
    await prisma.inventoryMovement.create({
      data: {
        stockItemId: stockItem.id,
        quantityChange: -10,
        type: 'ORDER_DEDUCTION',
        orderId: order1.id,
        performedById: counterUser.id
      }
    });

    // Daily sequence
    await prisma.dailyOrderSequence.create({
      data: {
        orderDate: new Date(),
        lastSequence: 101
      }
    });

    // Verify records exist before reset
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.orderItem.count()).toBe(1);
    expect(await prisma.orderStatusHistory.count()).toBe(1);
    expect(await prisma.preparationTimeAdjustment.count()).toBe(1);
    expect(await prisma.inventoryMovement.count({ where: { orderId: { not: null } } })).toBe(1);
    expect(await prisma.dailyOrderSequence.count()).toBe(1);
    expect(await prisma.category.count()).toBe(1);
    expect(await prisma.menuItem.count()).toBe(2);
    expect(await prisma.user.count()).toBe(2);

    // Perform Reset
    const res = await request(app)
      .post('/api/v1/admin/reset-business-data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmation: 'RESET BUSINESS DATA' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary.deletedOrders).toBe(1);
    expect(res.body.data.summary.deletedOrderItems).toBe(1);
    expect(res.body.data.summary.deletedInventoryMovements).toBe(1);
    expect(res.body.data.summary.deletedDailySequences).toBe(1);
    expect(res.body.data.summary.preservedCategories).toBe(1);
    expect(res.body.data.summary.preservedMenuItems).toBe(2);
    expect(res.body.data.summary.preservedUsers).toBe(2);

    // Verify operational tables are EMPTY
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
    expect(await prisma.orderStatusHistory.count()).toBe(0);
    expect(await prisma.preparationTimeAdjustment.count()).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { orderId: { not: null } } })).toBe(0);
    expect(await prisma.dailyOrderSequence.count()).toBe(0);

    // Verify PRESERVED tables are intact
    expect(await prisma.category.count()).toBe(1);
    expect(await prisma.menuItem.count()).toBe(2);
    expect(await prisma.user.count()).toBe(2);

    const preservedItem = await prisma.menuItem.findUnique({ where: { id: item1.id } });
    expect(preservedItem).not.toBeNull();
    expect(preservedItem?.name).toBe('Darjeeling Tea');
    expect(preservedItem?.pricePaise).toBe(4000);

    // Verify AuditLog was recorded
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'BUSINESS_DATA_RESET' }
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(adminUser.id);
  });

  it('should safely roll back entire transaction without partial deletions if any failure occurs', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser({ role: Role.ADMIN });

    // Seed one order
    const order = await prisma.order.create({
      data: {
        dailyOrderNumber: '#102',
        idempotencyKey: 'idem-102',
        status: OrderStatus.PLACED,
        totalPaise: 5000,
        customerPinHash: 'hashed-pin-2',
        initialEstimatedMinutes: 10,
        createdById: adminUser.id
      }
    });

    // Mock prisma.$transaction to simulate a failure halfway through
    const originalTransaction = prisma.$transaction.bind(prisma);
    (prisma as any).$transaction = async (callback: any) => {
      return originalTransaction(async (tx: any) => {
        // Execute initial step
        await tx.order.deleteMany();
        // Simulate unexpected database error (e.g. disk failure or constraint trigger)
        throw new Error('Simulated database write failure during reset');
      });
    };

    try {
      const res = await request(app)
        .post('/api/v1/admin/reset-business-data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirmation: 'RESET BUSINESS DATA' });

      expect(res.status).toBe(500);

      // Verify that due to rollback, the order STILL exists in the database
      const orderAfterRollback = await prisma.order.findUnique({ where: { id: order.id } });
      expect(orderAfterRollback).not.toBeNull();
      expect(orderAfterRollback?.id).toBe(order.id);
    } finally {
      // Restore original transaction method
      prisma.$transaction = originalTransaction;
    }
  });
});
