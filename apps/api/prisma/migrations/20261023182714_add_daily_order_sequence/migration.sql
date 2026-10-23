-- CreateTable
CREATE TABLE "DailyOrderSequence" (
    "orderDate" DATE NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "DailyOrderSequence_pkey" PRIMARY KEY ("orderDate")
);
