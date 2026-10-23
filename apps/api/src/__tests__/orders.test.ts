import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();
import { createApp } from '../app.js';
import { Role, OrderStatus } from '@campusbite/shared';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { prisma } from '../database/prisma.js';

const app = createApp();

describe('Order Creation & POS Data Integrity Gate', () => {
  let counterToken: string;
  let adminToken: string;
  let sandwichItemId: string;
  let coffeeItemId: string;

  beforeAll(async () => {
    await cleanDatabase();

    const counter = await createTestUser({ role: Role.COUNTER });
    counterToken = counter.token;
    const admin = await createTestUser({ role: Role.ADMIN });
    adminToken = admin.token;

    // Create Category & Items in DB
    const category = await prisma.category.create({
      data: { name: 'Main Course', displayOrder: 1 }
    });

    const sandwich = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        name: 'Veg Club Sandwich',
        pricePaise: 8000, // ₹80.00
        prepTimeMinutes: 12,
        isAvailable: true
      }
    });
    sandwichItemId = sandwich.id;

    const coffee = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        name: 'Hot Cappuccino',
        pricePaise: 5000, // ₹50.00
        prepTimeMinutes: 6,
        isAvailable: true
      }
    });
    coffeeItemId = coffee.id;
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('should create an order with server-side price calculation, snapshot, and unique daily order number', async () => {
    const idempotencyKey = uuidv4();

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        idempotencyKey,
        items: [
          { menuItemId: sandwichItemId, quantity: 2, notes: 'Toasted' },
          { menuItemId: coffeeItemId, quantity: 1 }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const orderData = response.body.data;
    const order = orderData.order;

    // 1. Verify Daily Order Number format
    expect(order.dailyOrderNumber).toMatch(/^CB-\d+$/);

    // 2. Verify Server-Side Price Calculation in Paise
    // (2 * 8000) + (1 * 5000) = 16000 + 5000 = 21000 paise (₹210.00)
    expect(order.totalPaise).toBe(21000);

    // 3. Verify Initial Preparation Estimate is the max prep time (max(12, 6) = 12 mins)
    expect(order.initialEstimatedMinutes).toBe(12);

    // 4. Verify line item snapshots
    expect(order.items.length).toBe(2);
    const sandwichItem = order.items.find((i: any) => i.menuItemId === sandwichItemId);
    expect(sandwichItem.nameSnapshot).toBe('Veg Club Sandwich');
    expect(sandwichItem.unitPricePaiseSnapshot).toBe(8000);
    expect(sandwichItem.subtotalPaise).toBe(16000);

    // 5. Verify random 4-digit PIN returned in 201 response
    expect(orderData.customerVerificationPin).toMatch(/^\d{4}$/);

    // 6. Verify PIN is stored as salted hash in database, NOT plaintext
    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(dbOrder?.customerPinHash).not.toBe(orderData.customerVerificationPin);
    expect(dbOrder?.customerPinHash).toMatch(/^\$2[aby]?\$\d+\$/); // bcrypt hash prefix
  });

  it('should preserve historical line-item snapshots even if menu prices change later', async () => {
    const idempotencyKey = uuidv4();

    // 1. Place order when coffee is 5000 paise
    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        idempotencyKey,
        items: [{ menuItemId: coffeeItemId, quantity: 1 }]
      });

    const orderId = createRes.body.data.order.id;
    expect(createRes.body.data.order.totalPaise).toBe(5000);

    // 2. Admin increases coffee price from 5000 to 7500 paise
    await request(app)
      .put(`/api/v1/menu/${coffeeItemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pricePaise: 7500 });

    // 3. Retrieve previously created order: line-item snapshot MUST still be 5000 paise!
    const fetchRes = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${counterToken}`);

    expect(fetchRes.status).toBe(200);
    expect(fetchRes.body.data.order.totalPaise).toBe(5000);
    expect(fetchRes.body.data.order.items[0].unitPricePaiseSnapshot).toBe(5000);
  });

  it('should be idempotent and not create duplicate orders for same idempotencyKey', async () => {
    const idempotencyKey = uuidv4();

    const payload = {
      idempotencyKey,
      items: [{ menuItemId: sandwichItemId, quantity: 1 }]
    };

    // First checkout tap
    const res1 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`)
      .send(payload);

    expect(res1.status).toBe(201);
    const firstOrderId = res1.body.data.order.id;

    // Accidental second tap with identical key
    const res2 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`)
      .send(payload);

    expect(res2.status).toBe(201);
    const secondOrderId = res2.body.data.order.id;

    // Must return the exact same order without creating a duplicate record
    expect(firstOrderId).toBe(secondOrderId);

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(1);
  });

  it('should reject order creation if any ordered item is unavailable', async () => {
    // Mark coffee unavailable
    await prisma.menuItem.update({
      where: { id: coffeeItemId },
      data: { isAvailable: false }
    });

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        idempotencyKey: uuidv4(),
        items: [{ menuItemId: coffeeItemId, quantity: 1 }]
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ITEM_UNAVAILABLE');

    // Re-enable coffee
    await prisma.menuItem.update({
      where: { id: coffeeItemId },
      data: { isAvailable: true }
    });
  });

  it('should prevent duplicate daily order numbers under concurrent submissions', async () => {
    // Fire 5 concurrent order creation requests
    const concurrentRequests = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${counterToken}`)
        .send({
          idempotencyKey: uuidv4(),
          items: [{ menuItemId: sandwichItemId, quantity: 1 }]
        })
    );

    const responses = await Promise.all(concurrentRequests);

    const dailyOrderNumbers = responses.map((r) => r.body.data.order.dailyOrderNumber);
    const uniqueNumbers = new Set(dailyOrderNumbers);

    // All 5 must have succeeded and have unique numbers without collisions
    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(uniqueNumbers.size).toBe(5);
  });

  it('should NEVER leak plaintext PIN or PIN hashes in general order listings', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`);

    expect(response.status).toBe(200);
    const orders = response.body.data.orders;
    expect(orders.length).toBeGreaterThan(0);

    for (const ord of orders) {
      expect(ord.customerPinHash).toBeUndefined();
      expect(ord.customerVerificationPin).toBeUndefined();
    }
  });

  it('should allow COUNTER staff to cancel a PLACED order with mandatory reason', async () => {
    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        idempotencyKey: uuidv4(),
        items: [{ menuItemId: sandwichItemId, quantity: 1 }]
      });

    const orderId = createRes.body.data.order.id;

    const cancelRes = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${counterToken}`)
      .send({ reason: 'Customer changed order to takeaway' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.order.status).toBe(OrderStatus.CANCELLED);
    expect(cancelRes.body.data.order.cancellationReason).toBe('Customer changed order to takeaway');
  });

  it('should prevent marking an order as handed over unless status is PREPARED', async () => {
    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        idempotencyKey: uuidv4(),
        items: [{ menuItemId: sandwichItemId, quantity: 1 }]
      });

    const orderId = createRes.body.data.order.id;

    // Order is currently PLACED; handover must fail
    const handoverRes = await request(app)
      .post(`/api/v1/orders/${orderId}/handover`)
      .set('Authorization', `Bearer ${counterToken}`);

    expect(handoverRes.status).toBe(400);
    expect(handoverRes.body.error.code).toBe('INVALID_STATUS_FOR_HANDOVER');

    // Simulate kitchen preparing order in DB
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PREPARED }
    });

    // Now handover should succeed
    const validHandover = await request(app)
      .post(`/api/v1/orders/${orderId}/handover`)
      .set('Authorization', `Bearer ${counterToken}`);

    expect(validHandover.status).toBe(200);
    expect(validHandover.body.data.order.status).toBe(OrderStatus.COMPLETED);
    expect(validHandover.body.data.order.completedAt).toBeDefined();
  });
});
