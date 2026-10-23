# CampusBite — Requirements Specification

## 1. Executive Summary

**CampusBite** is a mobile-first restaurant order management system tailored for college campus restaurants and food courts. It operates on a **₹0 initial hosting budget** and connects four distinct user groups:
1. **Administrators (Admin)**: Full management of staff, menu, pricing, stock, financial reports, closing summaries, and audit logs.
2. **Counter Staff**: High-speed, touch-optimized POS interface for taking in-person orders, tracking live orders, and handing over prepared food.
3. **Kitchen Staff (KDS)**: Real-time Kitchen Display System with visual and audio alerts, atomic order claiming, preparation countdown timers, and dynamic time extensions.
4. **Customers**: Self-service tracking via a single universal restaurant QR code (without user accounts or logins) using their order number and verification PIN.

---

## 2. User Roles & Permission Matrix

| Feature / Capability | Admin | Counter Staff | Kitchen Staff | Customer (Public) |
|---|:---:|:---:|:---:|:---:|
| **Staff Account Management (Create, Deactivate, Reset)** | ✅ | ❌ | ❌ | ❌ |
| **Menu CRUD & Price Configuration** | ✅ | ❌ | ❌ | ❌ |
| **Stock & Threshold Adjustments** | ✅ | ❌ | ❌ | ❌ |
| **View Financial & Closing Reports** | ✅ | ❌ | ❌ | ❌ |
| **View Operational Audit Logs** | ✅ | ❌ | ❌ | ❌ |
| **Create Customer Orders** | ✅ | ✅ | ❌ | ❌ |
| **View Active Order List** | ✅ | ✅ | ✅ | ❌ |
| **Mark Order as Handed Over (COMPLETED)** | ✅ | ✅ | ❌ | ❌ |
| **Cancel Order (Rule-governed)** | ✅ (Any state) | ✅ (PLACED only) | ❌ | ❌ |
| **Claim Unassigned Order (Atomic)** | ✅ | ❌ | ✅ | ❌ |
| **Start Preparation & Run Server Countdown** | ✅ | ❌ | ✅ | ❌ |
| **Extend Preparation Time (+1, +3, +5, custom)** | ✅ | ❌ | ✅ | ❌ |
| **Mark Order as PREPARED** | ✅ | ❌ | ✅ | ❌ |
| **Receive Kitchen Audio & Visual Alerts** | ❌ | ❌ | ✅ | ❌ |
| **Track Own Order via Order # + PIN** | ❌ | ❌ | ❌ | ✅ |

*Note: Admins have super-user privileges across counter and kitchen operational actions for troubleshooting and manager overrides.*

---

## 3. Detailed Functional Requirements

### 3.1 Authentication & User Management
* **FR-AUTH-1 (Role-Based Authentication)**: Secure email/password login for `ADMIN`, `COUNTER`, and `KITCHEN` roles with bcrypt/argon2 password hashing.
* **FR-AUTH-2 (Session Management)**: Secure HTTP-only cookies storing signed JWT or session tokens; token invalidation upon deactivation or password reset.
* **FR-AUTH-3 (No Public Registration)**: Staff accounts can only be created by an authenticated `ADMIN`. No public sign-up endpoints.
* **FR-AUTH-4 (First Admin Bootstrap)**: Controlled CLI script or environment-driven seed command to initialize the root admin account with strong password validation.
* **FR-AUTH-5 (Staff Deactivation)**: Deactivated accounts immediately lose API access and their active WebSocket connections are terminated.
* **FR-AUTH-6 (Rate Limiting)**: Strict brute-force protection on `/api/v1/auth/login` (maximum 5 failed attempts per IP per 15-minute window).

### 3.2 Menu & Category Management
* **FR-MENU-1 (Category Hierarchy)**: Menu items grouped by categories (e.g., Beverages, Quick Bites, Meals, Desserts) with display ordering.
* **FR-MENU-2 (Item Attributes)**: Name, description, category, price in integer paise (e.g., ₹65.00 = 6500 paise), preparation time in minutes, active/inactive toggle, optional stock association.
* **FR-MENU-3 (Historical Price Preservation)**: Price changes must never alter past order records. Order line items capture a snapshot of the unit price and item name at checkout.
* **FR-MENU-4 (Image Management)**: Configured image URLs or lightweight file storage with safe asset fallbacks.

### 3.3 Counter POS & Order Placement
* **FR-POS-1 (Touch-Friendly Menu Grid)**: Responsive, filterable category tabs and fast search optimized for mobile phone and tablet touch screens.
* **FR-POS-2 (Cart & Real-time Totals)**: Add/remove items, adjust quantities, calculate item subtotals and order gross total in paise, displaying in standard Indian Rupee (₹) format.
* **FR-POS-3 (Idempotent Submission)**: Every order submission carries a client-generated UUID `idempotencyKey` to prevent double-charging or duplicate tickets on double-taps or network retries.
* **FR-POS-4 (Human-Readable Order Number)**: Daily collision-safe sequence (e.g., `CB-101`, `CB-102`) reset daily, combined with an internal UUID.
* **FR-POS-5 (Customer Verification PIN)**: A collision-resistant 4-digit verification PIN (e.g., `8391`) generated per order, printed/shown on screen for the customer to track their food.
* **FR-POS-6 (Optional Kitchen Assignment)**: Counter staff can optionally designate an order to a specific on-duty kitchen staff member or leave it `UNASSIGNED`.
* **FR-POS-7 (Handover)**: Counter staff marks prepared orders as `COMPLETED` when collected by the customer.

### 3.4 Kitchen Operations (KDS)
* **FR-KDS-1 (Real-Time Order Feed)**: Live Socket.IO queue segmented into:
  1. *Unassigned / New*
  2. *In Preparation (Claimed)*
  3. *Prepared / Awaiting Handover*
* **FR-KDS-2 (Atomic Order Claiming)**: Concurrency-safe atomic database claim (`UPDATE ... WHERE assigned_to_id IS NULL AND status = 'PLACED'`) guaranteeing that two cooks tapping "Claim" simultaneously cannot both take the ticket.
* **FR-KDS-3 (Audio Alerts & Autoplay Bypass)**: High-visibility modal on login ("Tap to Enable Audio Alerts") unlocking the Web Audio API context. Plays a loud, distinct chime on new orders.
* **FR-KDS-4 (Server-Authoritative Countdown)**:
  * When `START PREPARATION` is clicked, server sets `preparation_started_at = NOW()` and `estimated_completion_at = NOW() + (prepTime * 60s)`.
  * Client calculates remaining seconds from `estimated_completion_at - serverTime`. Reconnection or phone screen sleep reconstructs the exact remaining timer without drift.
* **FR-KDS-5 (Preparation Time Adjustments)**: Kitchen can extend time (+1 min, +3 min, +5 min, or custom minutes with optional reason). The server increments `estimated_completion_at`, logs the change, and broadcasts the revision to kitchen, counter, and customer tracking clients.
* **FR-KDS-6 (Prepared Notification)**: Kitchen taps `MARK AS PREPARED`. Status moves to `PREPARED`, countdown stops, counter staff receives an instant ready alert, and customer tracking shows "Ready for Pickup!".

### 3.5 Customer Order Tracking
* **FR-TRACK-1 (Universal QR Code)**: Single static QR code placed on counter and tables pointing to `/track`.
* **FR-TRACK-2 (Secure Verification)**: Customer inputs their `Order Number` (e.g., `CB-101`) and `4-digit PIN`. Endpoint `/api/v1/orders/track` verifies the credentials and returns order details.
* **FR-TRACK-3 (Zero Data Leakage)**: Customer tracking response returns only order status, line item names & quantities, estimated remaining time, and timestamps. It strictly omits staff names, kitchen assignments, financial summaries, or other customers' orders.
* **FR-TRACK-4 (Live Status & Progress Indicator)**: Real-time visual progress stepper:
  1. *Order Placed* (shows initial estimate: `max(prep_time)` of items)
  2. *Preparing* (shows live countdown timer updated by server adjustments)
  3. *Ready for Collection* (pulsing green notification banner)
  4. *Completed* (thank you state)
* **FR-TRACK-5 (Brute Force Protection)**: IP and session rate-limiting on order verification to prevent automated PIN scraping.

### 3.6 Inventory & Low-Stock Management
* **FR-INV-1 (Stock Tracking)**: Menu items link to stock inventory items with `currentQuantity` and `lowStockThreshold`.
* **FR-INV-2 (Atomic Stock Deduction)**: When order is placed, stock is atomically deducted in a PostgreSQL transaction (`quantity >= ordered_quantity`). If stock is exhausted, order creation fails with an out-of-stock message.
* **FR-INV-3 (Stock Restoration on Cancellation)**: If a `PLACED` order is cancelled, stock is atomically restored in the same transaction.
* **FR-INV-4 (Low-Stock Badges)**: Automatic visual alert badges for Admin and Counter staff when `currentQuantity <= lowStockThreshold`.

### 3.7 Order Cancellation Rules
* **FR-CANCEL-1 (Authorized Roles)**:
  * `COUNTER`: May cancel orders strictly in `PLACED` state (before preparation begins).
  * `ADMIN`: May cancel orders in `PLACED` or `PREPARING` state with an override.
  * `KITCHEN`: Cannot cancel orders directly; must flag to counter/admin.
* **FR-CANCEL-2 (Audit & Reason)**: Every cancellation requires a non-empty text reason (e.g., "Customer changed mind", "Out of ingredient"). Timestamp and actor are recorded.

### 3.8 Analytics, Reporting & Audit Logs
* **FR-REP-1 (Sales Analytics)**: Today's Gross Revenue (paise to ₹), Net Sales, Order Count, Average Order Value (AOV).
* **FR-REP-2 (Item Performance)**: Top-selling items by quantity and by revenue.
* **FR-REP-3 (Kitchen Performance)**: Average preparation time vs. estimated time; workload volume per hour.
* **FR-REP-4 (Daily Closing Report)**: Daily operational summary containing total orders, completed vs. cancelled count, gross revenue, category breakdown, and cancellation audit details.
* **FR-AUDIT-1 (Audit Trail)**: Immutable log recording: Actor ID, role, action type (e.g., `MENU_PRICE_UPDATE`, `ORDER_CANCELLED`, `STOCK_ADJUSTED`), target entity, metadata JSON, and timestamp.

---

## 4. Non-Functional Requirements (NFR)

* **NFR-PERF-1 (Response Times)**: API endpoint response times < 200ms (P95) under normal campus peak loads (50 concurrent staff/users).
* **NFR-PERF-2 (Real-Time Latency)**: Socket.IO event propagation delay < 500ms from database commit to connected client screen updates.
* **NFR-RESP-1 (Mobile-First Ergonomics)**: 100% responsive UI; touch targets minimum 44px × 44px; zero horizontal scrolling on viewports from 320px width (iPhone SE) to 4K desktop screens.
* **NFR-RESIL-1 (Network Resiliency)**: Reconnection auto-retry with exponential backoff on Socket.IO; state resynchronization fetch on reconnect to prevent stale UI state.
* **NFR-SEC-1 (Zero Trust Boundaries)**: All authorization rules verified in backend middleware; frontend checks are UI conveniences only.
* **NFR-SEC-2 (Data Privacy)**: No tracking tokens or customer credentials logged in plain text or broadcast across unauthorized WebSocket rooms.
* **NFR-COST-1 (₹0 Hosting)**: Deployable entirely on verified free tiers (e.g., Render/Railway/Koyeb for Node.js API, Neon/Supabase for PostgreSQL, Vercel/Cloudflare Pages for React Web). Single-instance Node.js architecture with zero paid add-ons.

---

## 5. Scope Boundaries

| In Scope (Initial Release) | Out of Scope (Future Roadmap) |
|---|---|
| In-person cash/UPI manual recording at counter | Automated Razorpay/Stripe Payment Gateway integration |
| Mobile-first responsive web app for all roles | Native iOS / Android APKs (PWA manifest provided instead) |
| Universal QR code with manual Order # + PIN entry | Per-table physical QR codes with live table ordering |
| Digital on-screen KDS with sound alerts | ESC/POS thermal receipt hardware printing |
| Item-level stock counts and low-stock alerts | Multi-stage recipe/ingredient-level supply chain BOM |
| Single-restaurant deployment | Multi-tenant franchise multi-restaurant management |
