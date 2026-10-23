# CampusBite — Monitoring, Observability & Troubleshooting Guide
**Phase 7: Production Operations, Diagnostics, and Incident Response Runbook**

---

## 1. Observability Architecture & Health Probes

CampusBite provides structured logging, real-time health checks, and active WebSocket connection tracking.

### 1.1 Health Check Endpoints
CampusBite exposes two identical health endpoints for cloud load balancers and uptime monitors:
- `GET /health` (standard root probe for Render, Koyeb, Docker)
- `GET /api/v1/health` (standard versioned API probe)

#### Healthy Response (HTTP 200 OK):
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "uptimeSeconds": 84320,
    "timestamp": "2026-10-24T02:50:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-24T02:50:00.000Z"
  }
}
```

#### Degraded Response (HTTP 503 Service Unavailable):
Occurs when the database connection cannot be established or times out:
```json
{
  "success": false,
  "error": {
    "code": "SERVICE_DEGRADED",
    "message": "Database connection failed"
  },
  "meta": {
    "status": "degraded",
    "database": "disconnected",
    "timestamp": "2026-10-24T02:50:00.000Z"
  }
}
```

---

## 2. Troubleshooting Common Production Issues

### 2.1 Backend Free-Tier Spin-Down / Cold Starts (Render / Koyeb)
- **Symptom**: The first request in the morning or after 15 minutes of inactivity takes 25–40 seconds to respond.
- **Root Cause**: Render free web services automatically suspend compute after 15 minutes without inbound HTTP traffic.
- **Resolution**:
  1. Set up an external free-tier ping monitor (e.g., [Cron-Job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com)).
  2. Configure a periodic `GET https://campusbite-api.onrender.com/health` every 10 minutes between 8:30 AM and 8:30 PM (college dining hours).
  3. Ensure the ping does not run overnight to conserve free-tier hours.

### 2.2 WebSocket Disconnections & Reconnection
- **Symptom**: Kitchen staff or public display board shows "Offline" or fails to receive live updates.
- **Root Cause**: Mobile device screen locked, network switched from cellular to campus Wi-Fi, or transient proxy timeout.
- **Resolution**:
  1. The CampusBite Socket.IO client automatically attempts reconnection with exponential backoff (`reconnectionAttempts: Infinity`).
  2. When the tab becomes active (`visibilitychange` event), the client triggers an authoritative refresh (`GET /api/v1/orders/kitchen` or `/board`).
  3. Verify host supports WebSockets: On Render, native WebSockets are supported out-of-the-box. Ensure no proxy (e.g., Cloudflare free proxy without WebSockets enabled) terminates WS upgrades.

### 2.3 PostgreSQL Connection Pool Exhaustion
- **Symptom**: API logs show `PrismaClientInitializationError: Timed out fetching a new connection from the connection pool`.
- **Root Cause**: Free-tier PostgreSQL databases (Neon, Supabase) typically have connection limits of 20–50 concurrent TCP connections.
- **Resolution**:
  1. In production, always use connection pooling mode (`pgbouncer=true` in Neon or port `6543` in Supabase).
  2. Set connection limit in database connection string: `DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=15"`.
  3. In Express, ensure async route handlers do not leak connections by wrapping database operations inside `try...catch` with `next(err)`.

### 2.4 CORS Rejections (`CORS_NOT_ALLOWED`)
- **Symptom**: Browser console logs `Access to fetch at ... has been blocked by CORS policy`.
- **Root Cause**: `CORS_ORIGIN` environment variable does not match the exact scheme, subdomain, or port of the frontend URL.
- **Resolution**:
  1. Check browser origin (e.g., `https://campusbite.vercel.app`).
  2. Update `CORS_ORIGIN` in Render dashboard to include the exact URL: `https://campusbite.vercel.app`.
  3. Trailing slashes must be omitted (`https://campusbite.vercel.app`, NOT `https://campusbite.vercel.app/`).

### 2.5 Audio Alerts Blocked on Kitchen Display
- **Symptom**: Kitchen staff do not hear the audio chime when a new order arrives.
- **Root Cause**: Modern browser security policy prevents audio playback without prior user interaction.
- **Resolution**:
  1. CampusBite displays a banner ("Enable Sound Alerts") when kitchen staff logs in.
  2. Clicking "Enable Sound" unlocks the browser's `AudioContext`.
  3. If audio remains muted, check browser site permissions: Settings → Site Settings → Sound → Allow.

---

## 3. Incident Severity Levels & Response SLA

| Severity | Definition | Example | Immediate Action |
|---|---|---|---|
| **P1 — Critical** | System completely down; orders cannot be placed or cooked. | Database unreachable, API crash loop. | Check Render logs, restart web service, inspect Neon database metrics. |
| **P2 — Major** | Partial operational outage; workarounds exist. | WebSockets disconnected; counter works but real-time push fails. | Staff can use manual "Refresh" button on KDS while investigating WebSocket proxy. |
| **P3 — Minor** | Non-critical feature degraded. | CSV export fails, slow analytics report. | Review query execution times, adjust date filters. |
