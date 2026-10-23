# CampusBite — Database Backup, Migration & Disaster Recovery Guide
**Phase 7: Data Protection, Backup Strategies, and Recovery Runbook**

---

## 1. Overview & Data Architecture

CampusBite stores critical financial, order lifecycle, staff accounts, and inventory movement records in PostgreSQL. All schema changes are version-controlled through immutable Prisma migrations in `apps/api/prisma/migrations/`.

### Active Migration History
1. `20261023173449_init`: Initial core schema (Users, Categories, MenuItems, StockItems, Orders, OrderItems, OrderStatusHistory, PreparationTimeAdjustments, AuditLogs).
2. `20261023182714_add_daily_order_sequence`: Atomic daily sequence generator for sequential token numbers (`CB-101`, `CB-102`).
3. `20261023201651_add_inventory_movement_quantities`: Added `previousQuantity` and `newQuantity` balance audit snapshots to `InventoryMovement`.
4. `20261023205456_add_analytics_indexes`: Added performance indexes on `Order(createdAt)`, `Order(orderDate)`, `OrderItem(orderId, menuItemId)`, and `InventoryMovement(createdAt)`.

---

## 2. Safe Production Migration Procedure

**NEVER** run `prisma migrate dev` or `prisma db push` in production. These commands can result in accidental schema resets or data loss.

### The Authoritative Production Migration Command:
```bash
# From apps/api directory with production DATABASE_URL configured:
npx prisma migrate deploy
```

`prisma migrate deploy`:
- Reads unapplied migration directories in chronological order.
- Applies them strictly inside atomic SQL transactions.
- Never prompts interactively.
- Fails safely if a migration conflict occurs.

---

## 3. Backup Strategy under ₹0 Budget

### 3.1 Provider-Native Managed Backups
| Provider | Backup Feature | Retention Period | Restoration Mechanism |
|---|---|---|---|
| **Neon.tech (Free Tier)** | Point-In-Time Restore (PITR) / Storage Branching | 24 Hours rolling history | Instant branch creation from point in time via Neon Console |
| **Supabase (Free Tier)** | Daily Automatic Database Snapshots | 7 Days | 1-Click Restore via Supabase Dashboard |

### 3.2 Scheduled Logical Backups (`pg_dump`)
Because free-tier retention windows are typically 1–7 days, an external automated logical backup script guarantees long-term archival.

#### Automated Backup Script (`db-backup.sh`):
```bash
#!/bin/bash
set -e

# Configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups"
BACKUP_FILE="${BACKUP_DIR}/campusbite_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Starting logical database backup: $BACKUP_FILE"

# Dump using pg_dump with compression
pg_dump "$DATABASE_URL" \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip > "$BACKUP_FILE"

echo "✓ Backup successfully created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Retention policy: Prune backups older than 30 days
find "$BACKUP_DIR" -type f -name "campusbite_backup_*.sql.gz" -mtime +30 -exec rm {} \;
echo "✓ Pruned backup archives older than 30 days."
```

---

## 4. Disaster Recovery & Restoration Runbook

### Step 1: Provision Clean Target Database
If the primary database is corrupted or lost:
```bash
# Create empty replacement database
psql -U postgres -c "CREATE DATABASE campusbite_recovery;"
```

### Step 2: Restore Logical Backup
```bash
# Decompress and stream SQL dump into target database
gunzip -c ./backups/campusbite_backup_YYYYMMDD_HHMMSS.sql.gz | psql "$TARGET_DATABASE_URL"
```

### Step 3: Synchronize Schema & Migrations
```bash
# Verify all migrations are aligned
npx prisma migrate deploy
```

### Step 4: Verify Restoration Data Integrity
Run an automated verification query to check staff, menu items, and order count:
```bash
psql "$TARGET_DATABASE_URL" -c "
  SELECT 
    (SELECT count(*) FROM \"User\") AS staff_count,
    (SELECT count(*) FROM \"MenuItem\") AS menu_items_count,
    (SELECT count(*) FROM \"Order\") AS total_orders,
    (SELECT count(*) FROM \"InventoryMovement\") AS inventory_movements;
"
```

---

## 5. Recovery Time Objective (RTO) and Recovery Point Objective (RPO)

- **Recovery Point Objective (RPO)**:
  - *With Neon Branching*: $\le 5\text{ minutes}$ (continuous WAL streaming).
  - *With Daily Logical Dump*: $\le 24\text{ hours}$.
- **Recovery Time Objective (RTO)**:
  - $< 10\text{ minutes}$ (full logical restore on a standard college restaurant dataset with $< 100,000$ records).
