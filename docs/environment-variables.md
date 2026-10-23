# CampusBite — Environment Variables Reference Guide
**Phase 7: Production Configuration, Secrets Management & Variable Catalog**

This document details all configuration variables across the CampusBite monorepo, their constraints, security implications, and generation procedures.

---

## 1. Backend API Server (`apps/api/.env`)

| Variable Name | Required | Default / Example | Purpose & Constraints |
|---|:---:|---|---|
| `NODE_ENV` | Yes | `development` / `production` | Controls logging level, error sanitization, cookie security flags (`Secure`, `SameSite`), and secret strictness. |
| `PORT` | No | `5000` | Port on which Express and Socket.IO listen. Automatically provided by Render / Railway. |
| `DATABASE_URL` | Yes | `postgresql://...` | Connection string to PostgreSQL instance. In production, must use managed host with SSL (`?sslmode=require`). |
| `JWT_SECRET` | Yes | Random 64-char hex | Secret key used to sign and verify staff and tracking JWT tokens. In production, must be high entropy (min 32 chars). |
| `JWT_EXPIRES_IN`| No | `8h` | Lifetime of staff authentication session cookies. |
| `COOKIE_DOMAIN` | No | `""` | Domain attribute for auth cookies. Leave blank for same-origin or localhost. |
| `CORS_ORIGIN` | Yes | `http://localhost:5173` | Comma-separated list of allowed web frontend URLs. In production: `https://campusbite.vercel.app`. |
| `INITIAL_ADMIN_NAME` | No | `System Administrator` | Name assigned to the bootstrapped root administrator. |
| `INITIAL_ADMIN_EMAIL`| Yes | `admin@campusbite.internal` | Email for root administrator. Must be lowercase. |
| `INITIAL_ADMIN_PASSWORD` | Yes | Random strong password | Password used by `npm run db:seed:admin`. In production, default `AdminPassword123!` is strictly rejected. |

### How to Generate Secure Secrets Locally
To generate a cryptographically secure 256-bit (64-character hex) secret for `JWT_SECRET`:

**Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Using OpenSSL:**
```bash
openssl rand -hex 32
```

---

## 2. Frontend Web Application (`apps/web/.env`)

Vite environment variables are bundled into the client-side JavaScript bundle at build time. **Never put private API keys or database secrets in `apps/web/.env`**.

| Variable Name | Required | Default / Example | Purpose & Constraints |
|---|:---:|---|---|
| `VITE_API_BASE_URL` | No | `/api/v1` | URL path to the backend REST API. In same-domain/proxy setups, leave as `/api/v1`. For cross-origin production: `https://campusbite-api.onrender.com/api/v1`. |
| `VITE_SOCKET_URL` | No | `window.location.origin` | URL for Socket.IO connection. In same-domain setups, defaults to current origin. For cross-origin production: `https://campusbite-api.onrender.com`. |

---

## 3. Environment Modes Comparison

| Configuration | Development (`local`) | Production (`cloud`) |
|---|---|---|
| **`NODE_ENV`** | `development` | `production` |
| **Database** | Local PostgreSQL (`localhost:5432`) | Managed Neon / Supabase with SSL (`sslmode=require`) |
| **Auth Cookies** | `SameSite=lax; Secure=false` | `SameSite=none; Secure=true; HttpOnly` |
| **Error Handling** | Detailed error message and stack | Sanitized generic error message |
| **Default Passwords** | Allowed for bootstrap convenience | Strictly blocked by environment validator |
| **CORS Origins** | `localhost:5173`, `127.0.0.1:5173` | Specific deployed production domain(s) |
| **Payload Limits** | 1 MB | 1 MB |

---

## 4. Verification Command

To verify that your environment variables satisfy all production security criteria without starting the server, run:

```bash
cd apps/api
npx tsx -e "import('./src/config/env.js').then(() => console.log('✓ Environment configuration is valid for production.'))"
```
