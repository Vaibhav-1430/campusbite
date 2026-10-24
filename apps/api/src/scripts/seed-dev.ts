import { prisma } from '../database/prisma.js';
import { hashPassword } from '../utils/password.js';
import { Role } from '@campusbite/shared';
import { getSanitizedConnectionInfo } from '../database/connection-url.js';
import { assertSafeDevelopmentDatabase } from '../database/safety-guard.js';
import { env } from '../config/env.js';

async function main() {
  const dbInfo = assertSafeDevelopmentDatabase(env.DATABASE_URL, 'seed-dev');
  console.log(`Seeding development database (${dbInfo.database})...`);

  // 1. Staff Users
  const staff = [
    { email: 'admin@campusbite.internal', name: 'CampusBite Admin', password: 'AdminPassword123!', role: Role.ADMIN },
    { email: 'counter@campusbite.internal', name: 'Ramesh Counter', password: 'Counter@1234', role: Role.COUNTER },
    { email: 'kitchen@campusbite.internal', name: 'Suresh Chef', password: 'Kitchen@1234', role: Role.KITCHEN }
  ];

  for (const s of staff) {
    const existing = await prisma.user.findUnique({ where: { email: s.email } });
    if (!existing) {
      const passwordHash = await hashPassword(s.password);
      await prisma.user.create({
        data: {
          name: s.name,
          email: s.email,
          passwordHash,
          role: s.role,
          isActive: true
        }
      });
      console.log(`Created user: ${s.email} (${s.role})`);
    } else {
      console.log(`User already exists: ${s.email}`);
    }
  }

  // 2. Categories & Menu Items
  let catBreakfast = await prisma.category.findFirst({ where: { name: 'South Indian Breakfast' } });
  if (!catBreakfast) {
    catBreakfast = await prisma.category.create({
      data: { name: 'South Indian Breakfast', displayOrder: 1, isActive: true }
    });
  }

  let catSnacks = await prisma.category.findFirst({ where: { name: 'Snacks & Quick Bites' } });
  if (!catSnacks) {
    catSnacks = await prisma.category.create({
      data: { name: 'Snacks & Quick Bites', displayOrder: 2, isActive: true }
    });
  }

  let catDrinks = await prisma.category.findFirst({ where: { name: 'Beverages' } });
  if (!catDrinks) {
    catDrinks = await prisma.category.create({
      data: { name: 'Beverages', displayOrder: 3, isActive: true }
    });
  }

  const items = [
    { name: 'Masala Dosa', categoryId: catBreakfast.id, pricePaise: 6000, prepTimeMinutes: 8, description: 'Golden crispy dosa served with potato masala, sambar and chutneys' },
    { name: 'Idli Vada Combo', categoryId: catBreakfast.id, pricePaise: 4500, prepTimeMinutes: 5, description: 'Two steamed idlis and one medu vada' },
    { name: 'Crispy Samosa (2 pcs)', categoryId: catSnacks.id, pricePaise: 3000, prepTimeMinutes: 4, description: 'Hot potato & pea stuffed samosas served with mint chutney' },
    { name: 'Paneer Kathi Roll', categoryId: catSnacks.id, pricePaise: 8000, prepTimeMinutes: 10, description: 'Grilled spiced paneer cubes wrapped in a flakey paratha' },
    { name: 'Filter Coffee', categoryId: catDrinks.id, pricePaise: 2000, prepTimeMinutes: 3, description: 'Traditional South Indian chicory filter coffee' },
    { name: 'Cold Coffee with Ice Cream', categoryId: catDrinks.id, pricePaise: 5000, prepTimeMinutes: 4, description: 'Chilled blended espresso topped with vanilla ice cream' }
  ];

  for (const it of items) {
    const existing = await prisma.menuItem.findFirst({ where: { name: it.name } });
    if (!existing) {
      await prisma.menuItem.create({
        data: {
          name: it.name,
          categoryId: it.categoryId,
          pricePaise: it.pricePaise,
          prepTimeMinutes: it.prepTimeMinutes,
          description: it.description,
          isAvailable: true
        }
      });
      console.log(`Created menu item: ${it.name} (₹${it.pricePaise / 100})`);
    }
  }

  console.log('Development database successfully seeded!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
