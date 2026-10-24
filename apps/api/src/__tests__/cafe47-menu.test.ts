import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CAFE47_MENU_DATA } from '../modules/menu/cafe47-menu.data.js';
import { importCafe47Menu } from '../scripts/seed-cafe47-menu.js';
import { prisma } from '../database/prisma.js';
import { createCategorySchema, createMenuItemSchema } from '@campusbite/shared';

describe('Cafe47 Menu Architecture & Import Validation', () => {
  describe('Static Data & Menu Definition Validation', () => {
    it('should define exactly 9 distinct categories matching the board', () => {
      expect(CAFE47_MENU_DATA).toHaveLength(9);
      const categoryNames = CAFE47_MENU_DATA.map((c) => c.name);
      expect(new Set(categoryNames).size).toBe(9);
      expect(categoryNames).toEqual([
        'Noodles',
        'Fried Rice',
        'Momos',
        'Burgers',
        'Chinese Starters',
        'Soups & Thukpa',
        'Rolls',
        'Fries & Maggi',
        'Beverages'
      ]);
    });

    it('should contain exactly 65 menu items across all 9 categories', () => {
      const totalItems = CAFE47_MENU_DATA.reduce((acc, cat) => acc + cat.items.length, 0);
      expect(totalItems).toBe(65);
    });

    it('should validate every category against createCategorySchema', () => {
      for (const cat of CAFE47_MENU_DATA) {
        const parsed = createCategorySchema.parse({
          name: cat.name,
          displayOrder: cat.displayOrder,
          isActive: true
        });
        expect(parsed.name).toBe(cat.name);
        expect(parsed.displayOrder).toBe(cat.displayOrder);
      }
    });

    it('should validate every menu item against createMenuItemSchema with valid price and prep time', () => {
      const dummyCategoryId = '00000000-0000-0000-0000-000000000000';
      for (const cat of CAFE47_MENU_DATA) {
        for (const item of cat.items) {
          const pricePaise = Math.round(item.priceINR * 100);
          const parsed = createMenuItemSchema.parse({
            categoryId: dummyCategoryId,
            name: item.name,
            pricePaise,
            prepTimeMinutes: item.prepTimeMinutes,
            description: item.description,
            isAvailable: true
          });
          expect(parsed.name).toBe(item.name);
          expect(parsed.pricePaise).toBeGreaterThan(0);
          expect(parsed.prepTimeMinutes).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('should model Chinese Starters Dry/Gravy as single items with options in notes', () => {
      const starters = CAFE47_MENU_DATA.find((c) => c.name === 'Chinese Starters')!;
      expect(starters).toBeDefined();

      const manchurianVeg = starters.items.find((i) => i.name.includes('Veg Manchurian'));
      expect(manchurianVeg?.name).toBe('Veg Manchurian (Dry/Gravy)');
      expect(manchurianVeg?.priceINR).toBe(140);

      const manchurianChicken = starters.items.find((i) => i.name.includes('Chicken Manchurian'));
      expect(manchurianChicken?.name).toBe('Chicken Manchurian (Dry/Gravy)');
      expect(manchurianChicken?.priceINR).toBe(160);

      const chilliPaneer = starters.items.find((i) => i.name.includes('Chilli Paneer'));
      expect(chilliPaneer?.name).toBe('Chilli Paneer (Dry/Gravy)');
      expect(chilliPaneer?.priceINR).toBe(160);
    });

    it('should flag Chicken Thukpa, Egg Roll, and Beverages for cafe admin review', () => {
      const soupsCat = CAFE47_MENU_DATA.find((c) => c.name === 'Soups & Thukpa')!;
      const chickenThukpa = soupsCat.items.find((i) => i.name === 'Chicken Thukpa')!;
      expect(chickenThukpa.flaggedForReview).toBeDefined();
      expect(chickenThukpa.priceINR).toBe(120);

      const rollsCat = CAFE47_MENU_DATA.find((c) => c.name === 'Rolls')!;
      const eggRoll = rollsCat.items.find((i) => i.name === 'Egg Roll')!;
      expect(eggRoll.flaggedForReview).toBeDefined();

      const bevCat = CAFE47_MENU_DATA.find((c) => c.name === 'Beverages')!;
      expect(bevCat.items.length).toBe(12);
      for (const bev of bevCat.items) {
        expect(bev.flaggedForReview).toBeDefined();
      }
    });

    it('should verify pricing correctness for Noodles and Fried Rice', () => {
      const noodles = CAFE47_MENU_DATA.find((c) => c.name === 'Noodles')!.items;
      expect(noodles).toHaveLength(11);
      const vegNoodles = noodles.find((n) => n.name === 'Veg Noodles');
      expect(vegNoodles?.priceINR).toBe(100);
      const chickenEggNoodles = noodles.find((n) => n.name === 'Chicken Egg Noodles');
      expect(chickenEggNoodles?.priceINR).toBe(130);

      const friedRice = CAFE47_MENU_DATA.find((c) => c.name === 'Fried Rice')!.items;
      expect(friedRice).toHaveLength(9);
      const vegRice = friedRice.find((r) => r.name === 'Veg Fried Rice');
      expect(vegRice?.priceINR).toBe(100);
      const chickenGarlicChilliRice = friedRice.find((r) => r.name === 'Chicken Garlic Chilli Fried Rice');
      expect(chickenGarlicChilliRice?.priceINR).toBe(130);
    });
  });

  describe('Import Execution & Idempotency Simulation', () => {
    // In-memory data structures to simulate Prisma operations safely without network/production DB mutation
    let inMemoryCategories: Map<string, any>;
    let inMemoryMenuItems: Map<string, any>;

    beforeEach(() => {
      vi.restoreAllMocks();
      inMemoryCategories = new Map();
      inMemoryMenuItems = new Map();

      // Mock prisma.category
      vi.spyOn(prisma.category, 'findUnique').mockImplementation((async (args: any) => {
        const cat = Array.from(inMemoryCategories.values()).find((c) => c.name === args.where.name);
        return cat || null;
      }) as any);

      let counter = 1;
      const getUuid = () => `00000000-0000-4000-a000-${String(counter++).padStart(12, '0')}`;

      vi.spyOn(prisma.category, 'create').mockImplementation((async (args: any) => {
        const id = getUuid();
        const record = { id, ...args.data, createdAt: new Date(), updatedAt: new Date() };
        inMemoryCategories.set(id, record);
        return record;
      }) as any);

      vi.spyOn(prisma.category, 'update').mockImplementation((async (args: any) => {
        const existing = inMemoryCategories.get(args.where.id);
        const updated = { ...existing, ...args.data, updatedAt: new Date() };
        inMemoryCategories.set(args.where.id, updated);
        return updated;
      }) as any);

      // Mock prisma.menuItem
      vi.spyOn(prisma.menuItem, 'findFirst').mockImplementation((async (args: any) => {
        const items = Array.from(inMemoryMenuItems.values());
        if (args.where?.name) {
          return items.find((i) => i.name === args.where.name) || null;
        }
        return null;
      }) as any);

      vi.spyOn(prisma.menuItem, 'create').mockImplementation((async (args: any) => {
        const id = getUuid();
        const record = { id, ...args.data, createdAt: new Date(), updatedAt: new Date() };
        inMemoryMenuItems.set(id, record);
        return record;
      }) as any);

      vi.spyOn(prisma.menuItem, 'update').mockImplementation((async (args: any) => {
        const existing = inMemoryMenuItems.get(args.where.id);
        const updated = { ...existing, ...args.data, updatedAt: new Date() };
        inMemoryMenuItems.set(args.where.id, updated);
        return updated;
      }) as any);
    });

    it('should not mutate database when running dry-run', async () => {
      const createCatSpy = vi.spyOn(prisma.category, 'create');
      const createItemSpy = vi.spyOn(prisma.menuItem, 'create');

      const report = await importCafe47Menu({ dryRun: true });

      expect(report.isDryRun).toBe(true);
      expect(report.totalCategories).toBe(9);
      expect(report.totalItems).toBe(65);
      expect(report.categoriesCreated).toBe(9);
      expect(report.itemsCreated).toBe(65);

      expect(createCatSpy).not.toHaveBeenCalled();
      expect(createItemSpy).not.toHaveBeenCalled();
      expect(inMemoryCategories.size).toBe(0);
      expect(inMemoryMenuItems.size).toBe(0);
    });

    it('should create all 9 categories and 65 menu items on initial import', async () => {
      const report = await importCafe47Menu({ dryRun: false });

      expect(report.isDryRun).toBe(false);
      expect(report.categoriesCreated).toBe(9);
      expect(report.itemsCreated).toBe(65);
      expect(report.itemsUpdated).toBe(0);
      expect(report.itemsUnchanged).toBe(0);

      expect(inMemoryCategories.size).toBe(9);
      expect(inMemoryMenuItems.size).toBe(65);
    });

    it('should be strictly idempotent on re-import (0 created, 65 unchanged)', async () => {
      // 1. Initial run
      await importCafe47Menu({ dryRun: false });
      expect(inMemoryMenuItems.size).toBe(65);

      // 2. Second run
      const secondRun = await importCafe47Menu({ dryRun: false });

      expect(secondRun.categoriesCreated).toBe(0);
      expect(secondRun.categoriesExisting).toBe(9);
      expect(secondRun.itemsCreated).toBe(0);
      expect(secondRun.itemsUpdated).toBe(0);
      expect(secondRun.itemsUnchanged).toBe(65);

      // Verify no duplicates were created
      expect(inMemoryCategories.size).toBe(9);
      expect(inMemoryMenuItems.size).toBe(65);
    });

    it('should detect and update existing items when prices change', async () => {
      // 1. Initial run
      await importCafe47Menu({ dryRun: false });

      // Simulate a price change in the database for Veg Noodles
      const vegNoodles = Array.from(inMemoryMenuItems.values()).find((i) => i.name === 'Veg Noodles');
      expect(vegNoodles).toBeDefined();
      vegNoodles.pricePaise = 8000; // Old price: ₹80

      // 2. Re-import menu (Veg Noodles is ₹100 = 10000 paise in Cafe47 menu)
      const updateRun = await importCafe47Menu({ dryRun: false });

      expect(updateRun.itemsUpdated).toBe(1);
      expect(updateRun.itemsUnchanged).toBe(64);
      expect(updateRun.itemsCreated).toBe(0);

      const updatedNoodles = inMemoryMenuItems.get(vegNoodles.id);
      expect(updatedNoodles.pricePaise).toBe(10000);
    });
  });
});
