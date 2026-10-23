# CampusBite — Zero-Budget (₹0) Production Launch Runbook
**Phase 7: Step-by-Step Deployment Guide for Neon, Render & Vercel**

---

## Architecture Overview (₹0 Budget)

```mermaid
graph TD
    Client[Students & Counter Staff] -->|HTTPS| Vercel[Vercel - React SPA]
    Client -->|WSS / API| Render[Render - Node.js Express API]
    Render -->|Pooled TCP / SSL| Neon[Neon - Serverless PostgreSQL]
    TV[Cafeteria TV Board] -->|HTTPS / WSS| Vercel
    TV -->|Live Updates| Render
```

- **Frontend**: Vercel (Free tier, 100 GB/month bandwidth, global CDN, automated Git deploys).
- **Backend API & WebSockets**: Render Web Service (Free tier, 512 MB RAM, native WebSockets, free TLS certificate).
- **PostgreSQL Database**: Neon.tech (Free tier, 0.5 GB storage, connection pooling with PgBouncer, automated backups).

---

## STEP 1: Database Setup on Neon (PostgreSQL)

1. Sign up for free at [neon.tech](https://neon.tech).
2. Create a new project:
   - Project Name: `campusbite`
   - Region: Select closest region (e.g. `ap-southeast-1` or `eu-central-1`).
   - PostgreSQL version: `16`.
3. In the Neon Console Dashboard, locate your **Connection Details**:
   - Select **Connection pooling** checkbox.
   - Copy the Pooled connection string:
     ```
     postgresql://campusbite_user:YOUR_PASSWORD@ep-sample-123456-pooler.region.aws.neon.tech/neondb?sslmode=require
     ```
4. Save this string securely. You will use it as `DATABASE_URL`.

---

## STEP 2: Deploy API on Render (Backend)

1. Sign up for free at [render.com](https://render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository containing the CampusBite monorepo.
4. Configure service settings:
   - **Name**: `campusbite-api`
   - **Region**: Same region as Neon DB (to minimize network latency).
   - **Branch**: `main`
   - **Root Directory**: *(leave blank)*
   - **Environment**: `Node`
   - **Build Command**:
     ```bash
     npm ci && npm run build --workspace=@campusbite/shared && npm run build --workspace=@campusbite/api
     ```
   - **Start Command**:
     ```bash
     npm run start --workspace=@campusbite/api
     ```
   - **Plan Type**: `Free`
5. Configure **Environment Variables** in Render Dashboard:
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (Render provides this or uses 10000 by default)
   - `DATABASE_URL`: *(Paste your Neon pooled connection string from Step 1)*
   - `JWT_SECRET`: *(Generate via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)*
   - `JWT_EXPIRES_IN`: `8h`
   - `CORS_ORIGIN`: `https://campusbite.vercel.app` *(Replace with your actual Vercel domain from Step 3)*
   - `INITIAL_ADMIN_EMAIL`: `admin@campusbite.college`
   - `INITIAL_ADMIN_PASSWORD`: *(A strong password with at least 12 characters, numbers, and mixed case)*
   - `INITIAL_ADMIN_NAME`: `Campus Administrator`
6. Click **Create Web Service**.
7. Once deployed, note your service URL: `https://campusbite-api.onrender.com`.

---

## STEP 3: Deploy Web Frontend on Vercel

1. Sign up for free at [vercel.com](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Import your GitHub repository.
4. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm ci`
5. Configure **Environment Variables** in Vercel:
   - `VITE_API_BASE_URL`: `https://campusbite-api.onrender.com/api/v1`
   - `VITE_SOCKET_URL`: `https://campusbite-api.onrender.com`
6. Click **Deploy**.
7. Once deployed, Vercel gives you your live URL (e.g., `https://campusbite.vercel.app`).
8. *(Important)*: Go back to Render → `campusbite-api` → Environment Variables → Update `CORS_ORIGIN` to match your exact Vercel URL without trailing slash (`https://campusbite.vercel.app`).

---

## STEP 4: Run Initial Production Migrations & Admin Bootstrap

From your local terminal (or via Render Shell):

1. **Deploy all database migrations**:
   ```bash
   DATABASE_URL="YOUR_NEON_POOLED_CONNECTION_STRING" npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
   ```
2. **Seed the initial root administrator**:
   ```bash
   DATABASE_URL="YOUR_NEON_POOLED_CONNECTION_STRING" INITIAL_ADMIN_EMAIL="admin@campusbite.college" INITIAL_ADMIN_PASSWORD="YourStrongPassword123!" npx tsx apps/api/src/scripts/bootstrap-admin.ts
   ```

---

## STEP 5: Live Smoke-Test Verification

1. **API Health Probe**:
   Visit `https://campusbite-api.onrender.com/health` in your browser. Verify HTTP 200:
   ```json
   { "success": true, "data": { "status": "healthy", "database": "connected" } }
   ```
2. **Admin Authentication**:
   Visit `https://campusbite.vercel.app/login`. Sign in using `admin@campusbite.college` and your strong password. Verify redirection to Admin Portal.
3. **Menu & Categories**:
   Navigate to `/admin/menu`. Create a test category (e.g. "Beverages") and test item (e.g. "Cold Coffee").
4. **Counter POS Checkout**:
   Open `/counter`. Add the item to cart, click "Charge & Place Order". Verify receipt with daily order number (e.g. `CB-101`) and 4-digit PIN.
5. **Kitchen Display**:
   Open `/kitchen`. Verify the order appears in "Awaiting Preparation". Click "Claim Order", start timer, test a +5m adjustment, then click "Mark Prepared".
6. **Customer Tracking**:
   Open `/track` on smartphone. Enter order number and PIN. Verify real-time status transitions.
7. **Cafeteria TV Board**:
   Open `/board`. Verify the order appears in "Ready for Pickup".
8. **Shift Handover**:
   Back at `/counter`, complete handover. Order moves to Completed.
9. **Analytics Check**:
   Open `/admin/analytics`. Verify the order figures in fulfilled sales, gross recorded, and CSV export.
