# CampusBite — Deployment & Zero-Budget (₹0) Hosting Plan

## 1. Hosting Strategy & Provider Matrix (₹0 Budget)

To satisfy the **₹0 initial hosting budget** constraint while ensuring production-grade availability, SSL/TLS, and WebSocket support, the following verified free-tier providers are selected:

| Layer | Recommended Provider | Free Tier Limits | Failover / Alternative |
|---|---|---|---|
| **Frontend (SPA)** | **Vercel** / **Cloudflare Pages** | Unlimited preview deployments, 100 GB/month bandwidth, instant global CDN, custom domain support | Netlify |
| **Backend (API & Socket.IO)** | **Render.com** (Web Service) | 512 MB RAM, free SSL, native WebSocket support, HTTP/2 | Railway / Koyeb |
| **Database (PostgreSQL)** | **Neon.tech** / **Supabase** | 0.5 GB storage, connection pooling (PgBouncer), automatic point-in-time recovery | Supabase Free (500MB) |
| **Local Development** | **Local PostgreSQL 18.x** | Installed & running locally on Windows | Docker PostgreSQL |

---

## 2. Infrastructure Considerations & Trade-Offs

### 2.1 Backend Free-Tier Cold Starts & Keep-Alive
* **Render Free Tier Spin-Down**: Free instances on Render go to sleep after 15 minutes of inactivity. When the first customer scans the QR code or counter staff opens the tab, cold starts take ~25–40 seconds.
* **Mitigation**:
  1. A lightweight cron or health ping (`GET /api/v1/health`) scheduled during college lunch rush hours (e.g. via GitHub Actions or Cron-Job.org free tier) prevents sleep during restaurant opening hours (9:00 AM – 8:00 PM).
  2. Alternatively, deployment on Koyeb or Railway free credits provides persistent zero-sleep compute.

### 2.2 WebSocket & Single Instance Architecture
* **In-Memory Event Bus**: Because CampusBite runs as a single Node.js instance on the free tier, Socket.IO runs directly in memory without requiring a Redis Pub/Sub cluster (avoiding Redis hosting costs).
* **Connection Scalability**: A single 512 MB Node.js instance easily sustains 500+ concurrent WebSocket connections—exceeding a typical single college campus restaurant's peak traffic of 30–60 simultaneous active orders.

---

## 3. Environment Variables Specification

### 3.1 Backend (`apps/api/.env`)

```ini
# Environment
NODE_ENV=production
PORT=5000

# Database Connection (Neon / Supabase / Local)
DATABASE_URL="postgresql://user:password@ep-cool-campus-123456.us-east-2.aws.neon.tech/campusbite?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:password@ep-cool-campus-123456.us-east-2.aws.neon.tech/campusbite?sslmode=require"

# Security & Sessions
JWT_SECRET="super-strong-random-generated-entropy-key-min-64-chars"
COOKIE_DOMAIN="" # Empty for localhost, or ".vercel.app" for production

# CORS & Client Origins
CORS_ORIGIN="https://campusbite.vercel.app,http://localhost:5173"

# Root Administrator Bootstrap (Used only for first seed)
INITIAL_ADMIN_NAME="Campus Administrator"
INITIAL_ADMIN_EMAIL="admin@campusbite.college"
INITIAL_ADMIN_PASSWORD="SecureChangeMe123!"
```

### 3.2 Frontend (`apps/web/.env`)

```ini
# Production API & WebSocket Endpoints
VITE_API_BASE_URL="https://campusbite-api.onrender.com/api/v1"
VITE_SOCKET_URL="https://campusbite-api.onrender.com"
```

---

## 4. Universal Restaurant QR Code Strategy

### 4.1 Stability & Lifetime Guarantee
* **Permanent Route**: `https://campusbite.vercel.app/track`
* The restaurant prints physical QR stickers for counters, tables, and pickup stanchions.
* **Zero Secret Exposure**: The QR code encodes strictly the tracking landing page URL (`https://campusbite.vercel.app/track`). It contains **no tokens, passwords, or session IDs**.
* Even if the backend server is restarted, redeployed, or relocated, the physical QR code never expires or needs reprinting.

---

## 5. Build, Migration & Deployment Lifecycle

```mermaid
sequenceDiagram
    participant Dev as Developer / Git Push
    participant CI as GitHub CI / Actions
    participant DB as Neon PostgreSQL
    participant API as Render API
    participant Web as Vercel Web

    Dev->>CI: Push main branch
    CI->>CI: Run Vitest & Lint Checks
    CI->>DB: prisma migrate deploy
    CI->>API: Trigger Webhook Deploy
    CI->>Web: Trigger Build & Deploy
    Web-->>Dev: Live at campusbite.vercel.app
    API-->>Dev: Live at campusbite-api.onrender.com
```

### 5.1 Local & Staging Execution Scripts
* **Root Build**: `npm run build` (builds `packages/shared`, `apps/api`, and `apps/web` in topological dependency order).
* **Database Migration**: `npm run db:migrate` (executes `prisma migrate deploy`).
* **Initial Admin Seed**: `npm run db:seed:admin` (creates initial admin if not existing).
* **Development Mode**: `npm run dev` (starts concurrent API on `:5000` and Vite on `:5173`).

---

## 6. Backup & Disaster Recovery

* **Neon / Supabase Automatic Snapshots**: Daily point-in-time snapshots are included in the free tier.
* **Zero-Loss Closing Report Export**: Daily closing sales reports are downloadable as structured JSON and printable HTML by the administrator at the end of each operational shift, providing an offline hard-copy audit trail.
