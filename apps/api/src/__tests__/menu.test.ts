import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Role } from '@campusbite/shared';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { prisma } from '../database/prisma.js';

const app = createApp();

describe('Menu & Category Management API', () => {
  let adminToken: string;
  let counterToken: string;
  let kitchenToken: string;

  beforeAll(async () => {
    await cleanDatabase();
    const admin = await createTestUser({ role: Role.ADMIN });
    adminToken = admin.token;
    const counter = await createTestUser({ role: Role.COUNTER });
    counterToken = counter.token;
    const kitchen = await createTestUser({ role: Role.KITCHEN });
    kitchenToken = kitchen.token;
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  describe('Category Management', () => {
    let createdCategoryId: string;

    it('should allow ADMIN to create a category', async () => {
      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Quick Bites',
          displayOrder: 1,
          isActive: true
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.category.name).toBe('Quick Bites');
      createdCategoryId = response.body.data.category.id;
    });

    it('should deny non-admin staff from creating categories with 403', async () => {
      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${counterToken}`)
        .send({ name: 'Counter Attempt' });

      expect(response.status).toBe(403);
    });

    it('should reject duplicate category names with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Quick Bites' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DUPLICATE_CATEGORY');
    });

    it('should allow public/staff to list categories', async () => {
      const response = await request(app).get('/api/v1/categories');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.categories.length).toBeGreaterThan(0);
    });

    it('should allow ADMIN to update category', async () => {
      const response = await request(app)
        .patch(`/api/v1/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ displayOrder: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.category.displayOrder).toBe(5);
    });
  });

  describe('Menu Item Management', () => {
    let categoryId: string;
    let menuItemId: string;

    beforeAll(async () => {
      const cat = await prisma.category.create({
        data: { name: 'Beverages', displayOrder: 2 }
      });
      categoryId = cat.id;
    });

    it('should allow ADMIN to create a menu item with integer paise price', async () => {
      const response = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId,
          name: 'Cold Coffee',
          description: 'Brewed with fresh whole milk',
          pricePaise: 6500, // ₹65.00
          prepTimeMinutes: 5,
          isAvailable: true
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.item.name).toBe('Cold Coffee');
      expect(response.body.data.item.pricePaise).toBe(6500);
      menuItemId = response.body.data.item.id;
    });

    it('should reject negative prices and invalid preparation times', async () => {
      const responseNegativePrice = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId,
          name: 'Free Food',
          pricePaise: -500,
          prepTimeMinutes: 5
        });

      expect(responseNegativePrice.status).toBe(400);

      const responseZeroPrep = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId,
          name: 'Instant Food',
          pricePaise: 5000,
          prepTimeMinutes: 0
        });

      expect(responseZeroPrep.status).toBe(400);
    });

    it('should deny COUNTER and KITCHEN from creating menu items with 403', async () => {
      const res1 = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${counterToken}`)
        .send({ categoryId, name: 'Hack Item', pricePaise: 1000 });
      expect(res1.status).toBe(403);

      const res2 = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ categoryId, name: 'Hack Item 2', pricePaise: 1000 });
      expect(res2.status).toBe(403);
    });

    it('should allow COUNTER staff to toggle item availability during a shift', async () => {
      const response = await request(app)
        .patch(`/api/v1/menu/${menuItemId}/availability`)
        .set('Authorization', `Bearer ${counterToken}`)
        .send({ isAvailable: false });

      expect(response.status).toBe(200);
      expect(response.body.data.item.isAvailable).toBe(false);

      // Re-enable
      await request(app)
        .patch(`/api/v1/menu/${menuItemId}/availability`)
        .set('Authorization', `Bearer ${counterToken}`)
        .send({ isAvailable: true });
    });

    it('should filter menu items by search query and category', async () => {
      const response = await request(app)
        .get(`/api/v1/menu?categoryId=${categoryId}&search=Coffee`);

      expect(response.status).toBe(200);
      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.items[0].name).toBe('Cold Coffee');
    });

    it('should prevent deletion of a category that contains menu items', async () => {
      const response = await request(app)
        .delete(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('CATEGORY_IN_USE');
    });
  });
});
