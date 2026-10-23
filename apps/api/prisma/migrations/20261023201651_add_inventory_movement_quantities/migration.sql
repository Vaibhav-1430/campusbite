-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "newQuantity" INTEGER,
ADD COLUMN     "previousQuantity" INTEGER;

-- CreateIndex
CREATE INDEX "InventoryMovement_stockItemId_createdAt_idx" ON "InventoryMovement"("stockItemId", "createdAt");
