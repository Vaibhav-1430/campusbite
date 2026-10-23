# CampusBite — UI/UX Specification

## 1. Design System Foundations

CampusBite is engineered as a **mobile-first, high-throughput restaurant tool**. Staff will operate the system primarily on personal smartphones (Android and iPhone) in humid, fast-paced kitchen and counter environments.

### 1.1 Core Principles
* **Restrained & Professional**: Clean surfaces, high contrast, zero gratuitous glassmorphism or distracting decorative animations.
* **Touch-First Ergonomics**: Minimum touch target size of **44px × 44px** (preferably 48px) for all buttons, tabs, and steppers. Zero horizontal scrolling on 320px–420px viewports.
* **Semantic Iconography**: Use **Lucide React** icons exclusively. No emojis as interface icons.
* **Status Clarity**: Strong semantic colors for order states, instantly recognizable from a distance.

### 1.2 Color Palette & Semantic Tokens

| Token | Hex / HSL | Usage |
|---|---|---|
| **Background (Light)** | `#F8FAFC` (Slate 50) | Neutral page background |
| **Surface / Card** | `#FFFFFF` | Card backgrounds, drawer panels |
| **Text Primary** | `#0F172A` (Slate 900) | Headings, order numbers, critical data |
| **Text Muted** | `#64748B` (Slate 500) | Secondary labels, timestamps, descriptions |
| **Border / Divider** | `#E2E8F0` (Slate 200) | Subtle card borders, dividers |
| **Brand Primary** | `#EA580C` (Orange 600) | Primary CTAs, active selection, brand accents |
| **Status: PLACED** | `#2563EB` (Blue 600) | New orders, unassigned badges |
| **Status: PREPARING** | `#D97706` (Amber 600) | Active preparation, live countdown timers |
| **Status: PREPARED** | `#16A34A` (Green 600) | Ready for pickup, audio notifications |
| **Status: COMPLETED** | `#64748B` (Slate 500) | Completed tickets, archived logs |
| **Status: CANCELLED** | `#DC2626` (Red 600) | Cancelled orders, out-of-stock badges |

---

## 2. Screen Specifications & User Flows

### 2.1 Counter Staff Interface (POS)

#### Layout & Hierarchy
* **Sticky Top Bar**:
  * CampusBite logo + Counter Staff Name.
  * Active order count badge (links to Active Orders drawer).
  * Logout icon.
* **Category Pill Selector**:
  * Horizontally scrollable row of rounded pills: `[All]`, `[Beverages]`, `[Sandwiches]`, `[Combos]`, `[Desserts]`.
  * Instant category filtering without page reloads.
* **Menu Card Grid**:
  * Two-column grid on mobile phones (single column on narrow 320px screens; 3–4 columns on tablets/desktop).
  * Food item card:
    * Item name (bold 15px), price in ₹ format (e.g. `₹75`).
    * Optional thumbnail image with fallback badge.
    * Out-of-stock overlay (`"Unavailable"` in red badge, card disabled).
    * Quantity controller: `-` button, bold quantity count, `+` button. Tapping `+` when quantity is 0 adds to cart.
* **Persistent Bottom Cart Bar**:
  * Shows total items count, gross amount (e.g. `3 Items • ₹195.00`), and `View Cart` CTA.
  * Tapping opens a bottom slide-up Sheet (drawer) containing:
    * Line items list with quantity steppers and notes field (e.g. "No onions").
    * Kitchen staff assignment dropdown (defaults to "Unassigned / Any Cook").
    * Order Total.
    * Big Primary Action: **`Place Order`** (disables immediately upon tap with spinner to prevent double submissions).
* **Order Created Modal / Handover Slip**:
  * Displays: **Order # CB-142** (large 32px font) and **Customer PIN: 4821**.
  * Quick button: `Done / New Order`.

---

### 2.2 Kitchen Display System (KDS)

#### Audio Initialization & Connection Header
* **Autoplay Unlock Modal**: On initial page visit, a modal displays:
  > *"Enable Kitchen Sound Alerts: Web browsers require interaction before playing audio notifications."*
  > **[ Enable Audio Alerts ]**
* **Sticky Status Bar**:
  * Live status indicator: Pulsing green dot = `Connected Live`; Red dot = `Reconnecting...`.
  * Audio toggle button: `[ 🔔 Sound ON ]` / `[ 🔕 Muted ]`.
  * Kitchen load metric: `8 Active Orders | Avg Prep: 9m`.

#### Ticket Columns / Kanban View
On mobile devices, a segmented toggle allows cooks to switch between views or swipe:
`[ New (3) ]` | `[ Preparing (4) ]` | `[ Prepared (2) ]`
*(On tablet and desktop displays, all three columns sit side-by-side).*

* **Unassigned Ticket Card**:
  * Prominent Order Number (`CB-142`) + elapsed wait time (`Placed 2m ago`).
  * Item list with bold quantities (e.g. **2x** Cheese Sandwich, **1x** Masala Chai).
  * Big Primary Button: **`Claim & Start Prep`** (Atomic action).
* **Active Preparation Card**:
  * Cook assigned badge (e.g., `Chef Anita`).
  * **Live Countdown Timer Display**:
    * Large timer: `04:35 Remaining`.
    * Visual progress ring or bar transitioning from Green to Amber to Red if overdue.
  * **Quick Time Extension Toolbar**:
    * `+1m` | `+3m` | `+5m` | `+Custom`
    * Tapping immediately updates the authoritative server completion timestamp and reflects on customer tracking.
  * Big Primary Button: **`Mark as Prepared`**.
* **Prepared Card**:
  * Displays ready timestamp and waiting duration.
  * Status: `"Waiting for Counter Handover"`.

---

### 2.3 Customer Order Tracking Interface (`/track`)

#### Universal QR Entry Screen
* **Permanent Route**: `https://campusbite.internal/track`
* Clean, distraction-free card:
  * Restaurant brand header.
  * Input 1: **Daily Order Number** (e.g. `CB-142` with automatic uppercase formatting).
  * Input 2: **4-Digit Verification PIN** (e.g. `4821` with numeric keypad input).
  * Action: **`Track Order`**.
  * Error state: Friendly inline alert ("Order number or PIN does not match. Please verify your receipt").

#### Live Tracking Screen
* **Card Header**: Order `CB-142`
* **Real-time Status Stepper**:
  1. `Placed` (Checked when received)
  2. `In Preparation` (Active with animated pulse)
  3. `Ready for Pickup` (Celebratory green highlight)
  4. `Completed` (Checked)
* **Estimated Time Widget**:
  * Prior to prep start: *"Estimated preparation time: ~10 minutes. Preparation will begin shortly."*
  * During active prep:
    * Countdown: *"~4 mins remaining"* (reconstructed from server completion timestamp).
    * When extension is added: subtle banner: *"Kitchen added 3 mins to ensure quality."*
* **Ready State Announcement**:
  * When status reaches `PREPARED`:
  * Screen background transitions to soft green with high-contrast badge:
    > **Your order is ready! Please collect your food at the counter.**
* **Itemized Summary**:
  * Displays ordered food names and quantities (no pricing or staff info leaked).

---

### 2.4 Administrator Dashboard

* **Executive Metrics Grid**:
  * Today's Gross Revenue (e.g., `₹18,450`).
  * Total Orders Completed vs. Cancelled (e.g., `92 Orders (4 Cancelled)`).
  * Average Order Value (e.g., `₹200.50`).
  * Average Prep Duration (e.g., `8.2 mins`).
* **Visual Charts (Recharts)**:
  * Hourly Order & Revenue Trend (Bar chart showing rush periods: 12 PM–2 PM, 5 PM–7 PM).
  * Category Revenue Share (Pie / Donut chart).
* **Navigation Modules**:
  * **Staff Management**: Table listing staff members, role tags (`COUNTER`, `KITCHEN`, `ADMIN`), active toggle switches, and password reset buttons.
  * **Menu Management**: Categorized menu table with inline price editing, prep-time inputs, image URLs, and availability toggles.
  * **Stock Management**: Inventory levels with color-coded warning badges for items below `lowStockThreshold`, restock action dialogs.
  * **Daily Closing Report**: One-click summary table for shift end reconciliation, exportable to clean print/PDF view.
  * **Audit Trail**: Tabular log of staff actions with filters by actor and action type.

---

## 3. Resiliency, Loading & Error States

* **Network Disconnection Banner**:
  * When Socket.IO loses connection: A persistent, non-intrusive yellow banner appears at the top:
    > *"Connection lost. Retrying... (Offline changes paused)"*
  * When connection restores: Turns green for 2 seconds (*"Back online. Synced."*) then fades away.
* **Loading Skeletons**:
  * Ghost cards with subtle shimmer animation matching the exact shape of menu items and ticket cards to eliminate layout shifts (CLS = 0).
* **Empty States**:
  * Kitchen: *"No active tickets right now. All orders prepared!"* with a clean chef hat illustration.
  * Counter Cart: *"Your cart is empty. Tap menu items to begin an order."*
