import { Prisma } from '@prisma/client';

/**
 * Generates an atomic, collision-safe daily order number (e.g. CB-101, CB-102)
 * using PostgreSQL row-level locks on the DailyOrderSequence table.
 * Automatically resets sequence per calendar date.
 */
export const getNextDailyOrderNumber = async (
  orderDate: Date,
  tx: Prisma.TransactionClient
): Promise<string> => {
  // Extract UTC date in YYYY-MM-DD
  const dateStr = orderDate.toISOString().split('T')[0];

  const result: Array<{ lastSequence: number }> = await tx.$queryRaw`
    INSERT INTO "DailyOrderSequence" ("orderDate", "lastSequence")
    VALUES (${new Date(dateStr)}::date, 101)
    ON CONFLICT ("orderDate")
    DO UPDATE SET "lastSequence" = "DailyOrderSequence"."lastSequence" + 1
    RETURNING "lastSequence";
  `;

  const sequence = result[0]?.lastSequence ?? 101;
  return `CB-${sequence}`;
};
