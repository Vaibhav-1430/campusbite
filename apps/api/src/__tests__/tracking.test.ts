import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();
import { createApp } from '../app.js';
import { Role, OrderStatus } from '@campusbite/shared';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { prisma } from '../database/prisma.js';

const app = createApp();

describe('Customer Order Tracking & Public Display Board Gate', () => {
  let counterToken: string;
  let kitchenToken: string;
  let menuItemId: string;
  let orderId: string;
  let dailyOrderNumber: string;
  let rawPin: string;

  beforeAll(async () => {
    await cleanDatabase();

    const counter = await createTestUser({ role: Role.COUNTER, email: 'tracking.counter@test.internal' });
    counterToken = counter.token;

    const cook = await createTestUser({ role: Role.KITCHEN, email: 'tracking.cook@test.internal' });
    kitchenToken = cook.token;

    const category = await prisma.category.create({
      data: { name: 'Beverages', displayOrder: 1 }
    });

    const item = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        name: 'Cold Coffee Shake',
        pricePaise: 6500, // ₹65.00
        prepTimeMinutes: 10,
        isAvailable: true
      }
    });
    menuItemId = item.id;

    // Create an order via counter terminal to receive token and plaintext PIN
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        idempotencyKey: uuidv4(),
        items: [{ menuItemId, quantity: 2, notes: 'Extra chilled' }]
      });

    expect(orderRes.status).toBe(201);
    orderId = orderRes.body.data.order.id;
    dailyOrderNumber = orderRes.body.data.order.dailyOrderNumber;
    rawPin = orderRes.body.data.customerVerificationPin;
    expect(rawPin).toMatch(/^\d{4}$/);
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('should verify customer credentials and return sanitized tracking state with tracking token', async () => {
    const res = await request(app)
      .post('/api/v1/tracking/verify')
      .send({
        dailyOrderNumber,
        pin: rawPin
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.trackingToken).toBeTruthy();

    const order = res.body.data.order;
    expect(order.dailyOrderNumber).toBe(dailyOrderNumber);
    expect(order.status).toBe(OrderStatus.PLACED);
    expect(order.initialEstimatedMinutes).toBe(10);
    expect(order.preparationStartedAt).toBeNull();
    expect(order.items).toHaveLength(1);
    expect(order.items[0].name).toBe('Cold Coffee Shake');
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[0].notes).toBe('Extra chilled');

    // Zero data leakage validation:
    expect((order as any).customerPinHash).toBeUndefined();
    expect((order as any).totalPaise).toBeUndefined();
    expect((order as any).createdById).toBeUndefined();
    expect((order as any).createdByName).toBeUndefined();
    expect((order as any).assignedToId).toBeUndefined();
    expect((order as any).assignedToName).toBeUndefined();
  });

  it('should reject invalid PIN or non-existent order with generic 401 error', async () => {
    // 1. Wrong PIN
    const wrongPinRes = await request(app)
      .post('/api/v1/tracking/verify')
      .send({
        dailyOrderNumber,
        pin: '9999' === rawPin ? '1111' : '9999'
      });

    expect(wrongPinRes.status).toBe(401);
    expect(wrongPinRes.body.error.code).toBe('INVALID_VERIFICATION');
    expect(wrongPinRes.body.error.message).toBe('Invalid Order Number or PIN combination.');

    // 2. Non-existent order number -> generic error (prevents order enumeration)
    const nonexistentRes = await request(app)
      .post('/api/v1/tracking/verify')
      .send({
        dailyOrderNumber: 'CB-99999',
        pin: '1234'
      });

    expect(nonexistentRes.status).toBe(401);
    expect(nonexistentRes.body.error.code).toBe('INVALID_VERIFICATION');
    expect(nonexistentRes.body.error.message).toBe('Invalid Order Number or PIN combination.');
  });

  it('should reject malformed inputs with 400 Bad Request', async () => {
    const invalidPinRes = await request(app)
      .post('/api/v1/tracking/verify')
      .send({
        dailyOrderNumber,
        pin: 'abc' // not 4 digits
      });

    expect(invalidPinRes.status).toBe(400);

    const invalidOrderRes = await request(app)
      .post('/api/v1/tracking/verify')
      .send({
        dailyOrderNumber: 'INVALID',
        pin: '1234'
      });

    expect(invalidOrderRes.status).toBe(400);
  });

  it('should enforce rate limiting against brute-force verification attacks', async () => {
    const ip = '192.168.1.100';

    // Send 10 consecutive failed verification attempts
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/v1/tracking/verify')
        .set('X-Forwarded-For', ip)
        .send({
          dailyOrderNumber,
          pin: '0000'
        });
    }

    // 11th attempt should trigger 429 Too Many Requests
    const blockedRes = await request(app)
      .post('/api/v1/tracking/verify')
      .set('X-Forwarded-For', ip)
      .send({
        dailyOrderNumber,
        pin: '0000'
      });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('should allow polling latest order status using the issued tracking token', async () => {
    // 1. Verify to get token
    const verifyRes = await request(app)
      .post('/api/v1/tracking/verify')
      .send({
        dailyOrderNumber,
        pin: rawPin
      });
    const trackingToken = verifyRes.body.data.trackingToken;

    // 2. Poll status with tracking token
    const statusRes = await request(app)
      .get('/api/v1/tracking/status')
      .set('Authorization', `Bearer ${trackingToken}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.order.dailyOrderNumber).toBe(dailyOrderNumber);

    // 3. Attempt without token -> 401
    const noTokenRes = await request(app).get('/api/v1/tracking/status');
    expect(noTokenRes.status).toBe(401);

    // 4. Attempt with bogus token -> 401
    const badTokenRes = await request(app)
      .get('/api/v1/tracking/status')
      .set('Authorization', 'Bearer invalid.token.value');
    expect(badTokenRes.status).toBe(401);
  });

  it('should reflect live preparation start, time adjustments, and prepared status in tracking response', async () => {
    // 1. Verify to get tracking token
    const verifyRes = await request(app)
      .post('/api/v1/tracking/verify')
      .send({ dailyOrderNumber, pin: rawPin });
    const trackingToken = verifyRes.body.data.trackingToken;

    // 2. Kitchen starts preparation
    await request(app)
      .patch(`/api/v1/orders/${orderId}/start-prep`)
      .set('Authorization', `Bearer ${kitchenToken}`);

    let statusRes = await request(app)
      .get('/api/v1/tracking/status')
      .set('Authorization', `Bearer ${trackingToken}`);

    expect(statusRes.body.data.order.status).toBe(OrderStatus.PREPARING);
    expect(statusRes.body.data.order.preparationStartedAt).toBeTruthy();
    expect(statusRes.body.data.order.estimatedCompletionAt).toBeTruthy();

    // 3. Kitchen adds +4 minutes
    await request(app)
      .patch(`/api/v1/orders/${orderId}/adjust-time`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ minutesAdded: 4, reason: 'Blender queue' });

    statusRes = await request(app)
      .get('/api/v1/tracking/status')
      .set('Authorization', `Bearer ${trackingToken}`);

    expect(statusRes.body.data.order.prepAdjustments).toHaveLength(1);
    expect(statusRes.body.data.order.prepAdjustments[0].minutesAdded).toBe(4);
    expect(statusRes.body.data.order.prepAdjustments[0].reason).toBe('Blender queue');

    // 4. Kitchen marks prepared
    await request(app)
      .patch(`/api/v1/orders/${orderId}/prepared`)
      .set('Authorization', `Bearer ${kitchenToken}`);

    statusRes = await request(app)
      .get('/api/v1/tracking/status')
      .set('Authorization', `Bearer ${trackingToken}`);

    expect(statusRes.body.data.order.status).toBe(OrderStatus.PREPARED);
    expect(statusRes.body.data.order.preparedAt).toBeTruthy();
  });

  it('should prevent customer tracking tokens from executing staff operations', async () => {
    const verifyRes = await request(app)
      .post('/api/v1/tracking/verify')
      .send({ dailyOrderNumber, pin: rawPin });
    const trackingToken = verifyRes.body.data.trackingToken;

    // Customer attempts to handover/complete order using tracking token -> rejected
    const handoverRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/handover`)
      .set('Authorization', `Bearer ${trackingToken}`);

    expect(handoverRes.status).toBe(401);
  });

  it('should serve public display board data containing preparing and ready token queues only', async () => {
    const boardRes = await request(app).get('/api/v1/tracking/board');

    expect(boardRes.status).toBe(200);
    expect(boardRes.body.success).toBe(true);
    expect(Array.isArray(boardRes.body.data.board.preparing)).toBe(true);
    expect(Array.isArray(boardRes.body.data.board.ready)).toBe(true);

    // Current order was marked PREPARED in previous test, so it should be in ready list!
    expect(boardRes.body.data.board.ready).toContain(dailyOrderNumber);
  });
});
