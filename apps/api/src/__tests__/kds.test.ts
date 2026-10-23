import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();
import { createApp } from '../app.js';
import { Role, OrderStatus } from '@campusbite/shared';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { prisma } from '../database/prisma.js';

const app = createApp();

describe('Kitchen Display System (KDS) & Order Lifecycle Gate', () => {
  let adminToken: string;
  let counterToken: string;
  let kitchenToken1: string;
  let kitchenUserId1: string;
  let kitchenToken2: string;
  let kitchenUserId2: string;
  let menuItemId: string;

  beforeAll(async () => {
    await cleanDatabase();

    const admin = await createTestUser({ role: Role.ADMIN, email: 'kds.admin@test.internal' });
    adminToken = admin.token;

    const counter = await createTestUser({ role: Role.COUNTER, email: 'kds.counter@test.internal' });
    counterToken = counter.token;

    const cook1 = await createTestUser({ role: Role.KITCHEN, email: 'cook1@test.internal' });
    kitchenToken1 = cook1.token;
    kitchenUserId1 = cook1.user.id;

    const cook2 = await createTestUser({ role: Role.KITCHEN, email: 'cook2@test.internal' });
    kitchenToken2 = cook2.token;
    kitchenUserId2 = cook2.user.id;

    const category = await prisma.category.create({
      data: { name: 'KDS Snacks', displayOrder: 1 }
    });

    const item = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        name: 'Crispy Samosa',
        pricePaise: 2500, // ₹25.00
        prepTimeMinutes: 8,
        isAvailable: true
      }
    });
    menuItemId = item.id;
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  const createPlacedOrder = async (): Promise<string> => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        idempotencyKey: uuidv4(),
        items: [{ menuItemId, quantity: 2, notes: 'Crispy please' }]
      });
    expect(res.status).toBe(201);
    return res.body.data.order.id;
  };

  it('should allow KITCHEN staff to claim an unassigned order and prevent double claiming', async () => {
    const orderId = await createPlacedOrder();

    // 1. Counter staff should be rejected from claiming
    const counterRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/claim`)
      .set('Authorization', `Bearer ${counterToken}`);
    expect(counterRes.status).toBe(403);

    // 2. Cook 1 claims the order
    const claimRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/claim`)
      .set('Authorization', `Bearer ${kitchenToken1}`);
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.order.assignedToId).toBe(kitchenUserId1);

    // 3. Cook 2 attempts to claim the same order concurrently -> rejected with 400 ALREADY_CLAIMED
    const secondClaimRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/claim`)
      .set('Authorization', `Bearer ${kitchenToken2}`);
    expect(secondClaimRes.status).toBe(400);
    expect(secondClaimRes.body.error.code).toBe('ALREADY_CLAIMED');
  });

  it('should allow Counter or Admin to explicitly assign an order to a kitchen cook', async () => {
    const orderId = await createPlacedOrder();

    // 1. Attempt assigning to a counter staff (invalid target role)
    const invalidTargetRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/assign`)
      .set('Authorization', `Bearer ${counterToken}`)
      .send({ staffId: uuidv4() }); // nonexistent or non-kitchen
    expect(invalidTargetRes.status).toBe(400);

    // 2. Counter explicitly assigns order to Cook 2
    const assignRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/assign`)
      .set('Authorization', `Bearer ${counterToken}`)
      .send({ staffId: kitchenUserId2 });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.order.assignedToId).toBe(kitchenUserId2);
  });

  it('should start preparation, persist authoritative timestamps, and compute estimated completion', async () => {
    const orderId = await createPlacedOrder();

    // 1. Countdown must NOT start upon placement
    const initialGet = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${kitchenToken1}`);
    expect(initialGet.body.data.order.status).toBe(OrderStatus.PLACED);
    expect(initialGet.body.data.order.preparationStartedAt).toBeNull();
    expect(initialGet.body.data.order.estimatedCompletionAt).toBeNull();

    // 2. Cook 1 explicitly clicks Start Preparation
    const startRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/start-prep`)
      .set('Authorization', `Bearer ${kitchenToken1}`);
    expect(startRes.status).toBe(200);
    const order = startRes.body.data.order;
    expect(order.status).toBe(OrderStatus.PREPARING);
    expect(order.preparationStartedAt).toBeTruthy();
    expect(order.estimatedCompletionAt).toBeTruthy();

    const startedTime = new Date(order.preparationStartedAt).getTime();
    const estCompletionTime = new Date(order.estimatedCompletionAt).getTime();
    const diffMinutes = Math.round((estCompletionTime - startedTime) / 60000);
    expect(diffMinutes).toBe(8); // Based on item's prepTimeMinutes = 8

    // 3. Repeated attempt to start prep should fail with 400 ALREADY_PREPARING
    const duplicateStart = await request(app)
      .patch(`/api/v1/orders/${orderId}/start-prep`)
      .set('Authorization', `Bearer ${kitchenToken1}`);
    expect(duplicateStart.status).toBe(400);
    expect(duplicateStart.body.error.code).toBe('ALREADY_PREPARING');
  });

  it('should allow kitchen staff to add preparation time and persist adjustments', async () => {
    const orderId = await createPlacedOrder();

    // Start prep first
    const startRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/start-prep`)
      .set('Authorization', `Bearer ${kitchenToken1}`);
    const originalCompletion = new Date(startRes.body.data.order.estimatedCompletionAt).getTime();

    // 1. Reject invalid/negative minutes
    const invalidAdj = await request(app)
      .patch(`/api/v1/orders/${orderId}/adjust-time`)
      .set('Authorization', `Bearer ${kitchenToken1}`)
      .send({ minutesAdded: -3 });
    expect(invalidAdj.status).toBe(400);

    // 2. Add +5 minutes
    const adjustRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/adjust-time`)
      .set('Authorization', `Bearer ${kitchenToken1}`)
      .send({ minutesAdded: 5, reason: 'High fry backlog' });
    expect(adjustRes.status).toBe(200);

    const updated = adjustRes.body.data.order;
    const newCompletion = new Date(updated.estimatedCompletionAt).getTime();
    expect(newCompletion - originalCompletion).toBe(5 * 60 * 1000); // exactly 5 minutes added

    // 3. Verify adjustments are returned in order details
    expect(updated.prepAdjustments).toHaveLength(1);
    expect(updated.prepAdjustments[0].minutesAdded).toBe(5);
    expect(updated.prepAdjustments[0].reason).toBe('High fry backlog');
  });

  it('should transition to PREPARED and prevent Kitchen from marking COMPLETED', async () => {
    const orderId = await createPlacedOrder();

    await request(app)
      .patch(`/api/v1/orders/${orderId}/start-prep`)
      .set('Authorization', `Bearer ${kitchenToken1}`);

    // 1. Kitchen marks cooking prepared
    const prepRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/prepared`)
      .set('Authorization', `Bearer ${kitchenToken1}`);
    expect(prepRes.status).toBe(200);
    expect(prepRes.body.data.order.status).toBe(OrderStatus.PREPARED);
    expect(prepRes.body.data.order.preparedAt).toBeTruthy();

    // 2. Kitchen staff CANNOT mark COMPLETED
    const handoverRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/handover`)
      .set('Authorization', `Bearer ${kitchenToken1}`);
    expect(handoverRes.status).toBe(403);
  });

  it('should enforce that Counter staff can only mark Handover (COMPLETED) when order is PREPARED', async () => {
    const orderId = await createPlacedOrder();

    // 1. Attempt handover while in PLACED status -> rejected with 400
    const placedHandover = await request(app)
      .patch(`/api/v1/orders/${orderId}/handover`)
      .set('Authorization', `Bearer ${counterToken}`);
    expect(placedHandover.status).toBe(400);
    expect(placedHandover.body.error.code).toBe('INVALID_STATUS_FOR_HANDOVER');

    // 2. Start prep -> attempt handover while PREPARING -> rejected with 400
    await request(app)
      .patch(`/api/v1/orders/${orderId}/start-prep`)
      .set('Authorization', `Bearer ${kitchenToken1}`);

    const preparingHandover = await request(app)
      .patch(`/api/v1/orders/${orderId}/handover`)
      .set('Authorization', `Bearer ${counterToken}`);
    expect(preparingHandover.status).toBe(400);

    // 3. Mark PREPARED -> now handover succeeds!
    await request(app)
      .patch(`/api/v1/orders/${orderId}/prepared`)
      .set('Authorization', `Bearer ${kitchenToken1}`);

    const validHandover = await request(app)
      .patch(`/api/v1/orders/${orderId}/handover`)
      .set('Authorization', `Bearer ${counterToken}`);
    expect(validHandover.status).toBe(200);
    expect(validHandover.body.data.order.status).toBe(OrderStatus.COMPLETED);
    expect(validHandover.body.data.order.completedAt).toBeTruthy();
  });

  it('should enforce cancellation boundaries and prevent race with preparation start', async () => {
    const orderId = await createPlacedOrder();

    // 1. Kitchen staff cannot cancel orders
    const kitchenCancel = await request(app)
      .patch(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${kitchenToken1}`)
      .send({ reason: 'Kitchen cannot make this' });
    expect(kitchenCancel.status).toBe(403);

    // 2. Start preparation
    await request(app)
      .patch(`/api/v1/orders/${orderId}/start-prep`)
      .set('Authorization', `Bearer ${kitchenToken1}`);

    // 3. Counter staff attempts to cancel PREPARING order -> rejected
    const counterCancel = await request(app)
      .patch(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${counterToken}`)
      .send({ reason: 'Customer changed their mind' });
    expect(counterCancel.status).toBe(400);
    expect(counterCancel.body.error.code).toBe('ORDER_ALREADY_PREPARING');

    // 4. Admin CAN cancel a PREPARING order
    const adminCancel = await request(app)
      .patch(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Emergency cafeteria evacuation' });
    expect(adminCancel.status).toBe(200);
    expect(adminCancel.body.data.order.status).toBe(OrderStatus.CANCELLED);

    // 5. Trying to start preparation on CANCELLED order -> rejected
    const startOnCancelled = await request(app)
      .patch(`/api/v1/orders/${orderId}/start-prep`)
      .set('Authorization', `Bearer ${kitchenToken1}`);
    expect(startOnCancelled.status).toBe(400);
    expect(startOnCancelled.body.error.code).toBe('ORDER_ALREADY_CANCELLED');
  });
});
