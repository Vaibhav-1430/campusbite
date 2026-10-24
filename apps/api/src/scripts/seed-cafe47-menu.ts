import { prisma } from '../database/prisma.js';
import { CAFE47_MENU_DATA, Cafe47CategoryDef, Cafe47MenuItemDef } from '../modules/menu/cafe47-menu.data.js';
import { getSanitizedConnectionInfo } from '../database/connection-url.js';
import { env } from '../config/env.js';
import { createCategorySchema, createMenuItemSchema } from '@campusbite/shared';

export interface Cafe47ImportItemResult {
  category: string;
  item: string;
  priceINR: number;
  dietary: string;
  status: 'CREATED' | 'UPDATED' | 'UNCHANGED';
  flaggedForReview?: string;
}

export interface Cafe47MenuImportReport {
  targetDatabase: {
    host: string;
    database: string;
    isNeon: boolean;
    isPooled: boolean;
  };
  isDryRun: boolean;
  categoriesCreated: number;
  categoriesExisting: number;
  totalCategories: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  totalItems: number;
  flaggedReviewItems: { name: string; category: string; reason: string }[];
  details: Cafe47ImportItemResult[];
}

export async function importCafe47Menu(options: { dryRun?: boolean } = {}): Promise<Cafe47MenuImportReport> {
  const isDryRun = Boolean(options.dryRun);
  const dbUrl = process.env.DATABASE_URL || env.DATABASE_URL;
  const dbInfo = getSanitizedConnectionInfo(dbUrl);

  const report: Cafe47MenuImportReport = {
    targetDatabase: {
      host: dbInfo.host,
      database: dbInfo.database,
      isNeon: dbInfo.isNeon,
      isPooled: dbInfo.isPooled
    },
    isDryRun,
    categoriesCreated: 0,
    categoriesExisting: 0,
    totalCategories: CAFE47_MENU_DATA.length,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsUnchanged: 0,
    totalItems: 0,
    flaggedReviewItems: [],
    details: []
  };

  for (const catDef of CAFE47_MENU_DATA) {
    // 1. Validate Category input schema
    createCategorySchema.parse({
      name: catDef.name,
      displayOrder: catDef.displayOrder,
      isActive: true
    });

    // 2. Check if category exists
    let existingCategory = await prisma.category.findUnique({
      where: { name: catDef.name }
    });

    let categoryId = existingCategory?.id || 'dry-run-category-id';

    if (!existingCategory) {
      report.categoriesCreated++;
      if (!isDryRun) {
        existingCategory = await prisma.category.create({
          data: {
            name: catDef.name,
            displayOrder: catDef.displayOrder,
            isActive: true
          }
        });
        categoryId = existingCategory.id;
      }
    } else {
      report.categoriesExisting++;
      if (!isDryRun && existingCategory.displayOrder !== catDef.displayOrder) {
        await prisma.category.update({
          where: { id: existingCategory.id },
          data: { displayOrder: catDef.displayOrder, isActive: true }
        });
      }
    }

    // 3. Process items in this category
    for (const itemDef of catDef.items) {
      report.totalItems++;
      const pricePaise = Math.round(itemDef.priceINR * 100);

      // Validate Item schema with a dummy or real category ID
      createMenuItemSchema.parse({
        categoryId: categoryId === 'dry-run-category-id' ? '00000000-0000-0000-0000-000000000000' : categoryId,
        name: itemDef.name,
        pricePaise,
        prepTimeMinutes: itemDef.prepTimeMinutes,
        description: itemDef.description,
        isAvailable: true
      });

      if (itemDef.flaggedForReview) {
        report.flaggedReviewItems.push({
          name: itemDef.name,
          category: catDef.name,
          reason: itemDef.flaggedForReview
        });
      }

      // Check existing item by name across database to prevent duplicate entries
      const existingItem = await prisma.menuItem.findFirst({
        where: { name: itemDef.name }
      });

      if (!existingItem) {
        report.itemsCreated++;
        report.details.push({
          category: catDef.name,
          item: itemDef.name,
          priceINR: itemDef.priceINR,
          dietary: itemDef.dietary,
          status: 'CREATED',
          flaggedForReview: itemDef.flaggedForReview
        });

        if (!isDryRun && existingCategory) {
          await prisma.menuItem.create({
            data: {
              categoryId: existingCategory.id,
              name: itemDef.name,
              pricePaise,
              prepTimeMinutes: itemDef.prepTimeMinutes,
              description: itemDef.description,
              isAvailable: true
            }
          });
        }
      } else {
        const needsUpdate =
          (existingCategory && existingItem.categoryId !== existingCategory.id) ||
          existingItem.pricePaise !== pricePaise ||
          existingItem.description !== itemDef.description ||
          existingItem.prepTimeMinutes !== itemDef.prepTimeMinutes;

        if (needsUpdate) {
          report.itemsUpdated++;
          report.details.push({
            category: catDef.name,
            item: itemDef.name,
            priceINR: itemDef.priceINR,
            dietary: itemDef.dietary,
            status: 'UPDATED',
            flaggedForReview: itemDef.flaggedForReview
          });

          if (!isDryRun) {
            await prisma.menuItem.update({
              where: { id: existingItem.id },
              data: {
                categoryId: existingCategory ? existingCategory.id : existingItem.categoryId,
                pricePaise,
                description: itemDef.description,
                prepTimeMinutes: itemDef.prepTimeMinutes,
                isAvailable: true
              }
            });
          }
        } else {
          report.itemsUnchanged++;
          report.details.push({
            category: catDef.name,
            item: itemDef.name,
            priceINR: itemDef.priceINR,
            dietary: itemDef.dietary,
            status: 'UNCHANGED',
            flaggedForReview: itemDef.flaggedForReview
          });
        }
      }
    }
  }

  return report;
}

// CLI runner
if (process.argv[1]?.includes('seed-cafe47-menu')) {
  const flags = new Set(process.argv.slice(2));
  const isDryRun = flags.has('--dry-run') || process.env.DRY_RUN === 'true';
  const requireNeon = flags.has('--require-neon') || process.env.REQUIRE_NEON === 'true';

  const dbUrl = process.env.DATABASE_URL || env.DATABASE_URL;
  const dbInfo = getSanitizedConnectionInfo(dbUrl);

  console.log('=== CAFE47 MENU IMPORT RUNNER ===');
  console.log(`Database Target: ${dbInfo.provider}://${dbInfo.host}:${dbInfo.port}/${dbInfo.database} [Neon: ${dbInfo.isNeon}, Pooled: ${dbInfo.isPooled}]`);

  if (requireNeon && (!dbInfo.isNeon || dbInfo.host === 'localhost' || dbInfo.host === '127.0.0.1')) {
    console.error(`SAFETY ABORT: Target database "${dbInfo.host}" is not a verified Neon production database.`);
    process.exit(1);
  }

  console.log(`Mode: ${isDryRun ? 'DRY-RUN (NO DB MUTATIONS)' : 'LIVE IMPORT / SEED'}`);

  importCafe47Menu({ dryRun: isDryRun })
    .then((report) => {
      console.log('\n--- IMPORT SUMMARY ---');
      console.log(`Categories: ${report.totalCategories} total (Created: ${report.categoriesCreated}, Existing: ${report.categoriesExisting})`);
      console.log(`Menu Items: ${report.totalItems} total (Created: ${report.itemsCreated}, Updated: ${report.itemsUpdated}, Unchanged: ${report.itemsUnchanged})`);

      if (report.flaggedReviewItems.length > 0) {
        console.log('\n--- ITEMS FLAGGED FOR CAFE ADMIN REVIEW ---');
        report.flaggedReviewItems.forEach((f, idx) => {
          console.log(`  ${idx + 1}. [${f.category}] ${f.name} => ${f.reason}`);
        });
      }

      console.log(`\nStatus: ${isDryRun ? 'DRY RUN COMPLETED SUCCESSFULLY' : 'MENU IMPORT COMPLETED SUCCESSFULLY'}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error during Cafe47 menu import:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
