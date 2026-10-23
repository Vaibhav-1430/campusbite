# CampusBite — REST API & WebSocket Specification

## 1. API Conventions & Standards

* **Base URL**: `/api/v1`
* **Transport**: HTTPS for REST endpoints; WSS for Socket.IO.
* **Content Type**: `application/json; charset=utf-8`
* **Date Format**: ISO-8601 strings in UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`).
* **Monetary Values**: Stored and transmitted as **integer paise** (e.g. ₹150.00 = `15000`).

### 1.1 Response Envelope Structure

#### Success Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-10-23T17:15:00.000Z",
    "requestId": "req_8f7b2c9"
  }
}
```

#### Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Cannot start preparation on an order that is already completed or cancelled.",
    "details": null
  },
  "meta": {
    "timestamp": "2026-10-23T17:15:00.000Z"
  }
}
```

---

## 2. Authentication & Session Endpoints

### 2.1 Login
* **POST** `/api/v1/auth/login`
* **Rate Limit**: 5 attempts per IP per 15 minutes.
* **Request Body**:
  ```json
  {
    "email": "chef.raj@campusbite.internal",
    "password": "Password123!"
  }
  ```
* **Success (200 OK)**: Sets HTTP-only cookie `campusbite_session` and returns user profile:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "c1f7a0b3-9e4a-4a2e-8d9b-123456789abc",
        "name": "Raj Kumar",
        "email": "chef.raj@campusbite.internal",
        "role": "KITCHEN"
      }
    }
  }
  ```

### 2.2 Logout
* **POST** `/api/v1/auth/logout`
* **Success (200 OK)**: Clears cookie and terminates server-side token validity.

### 2.3 Current Session Check
* **GET** `/api/v1/auth/me`
* **Auth**: Required (any active staff role).
* **Success (200 OK)**: Returns authenticated user profile.

---

## 3. Menu & Category Endpoints

### 3.1 Get All Categories & Menu Items
* **GET** `/api/v1/menu`
* **Auth**: Public or Staff (counter POS & display boards).
* **Query Params**: `?includeInactive=false&categoryId=uuid`
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "categories": [
        {
          "id": "cat_1",
          "name": "Quick Bites",
          "displayOrder": 1,
          "items": [
            {
              "id": "menu_101",
              "name": "Grilled Cheese Sandwich",
              "description": "Double cheddar with toasted sourdough",
              "pricePaise": 7500,
              "prepTimeMinutes": 8,
              "imageUrl": "/images/menu/sandwich.webp",
              "isAvailable": true,
              "stockQuantity": 24
            }
          ]
        }
      ]
    }
  }
  ```

### 3.2 Create Menu Item (Admin Only)
* **POST** `/api/v1/menu`
* **Auth**: `ADMIN`
* **Request Body**:
  ```json
  {
    "categoryId": "cat_1",
    "name": "Cold Coffee (Large)",
    "description": "Brewed with whole milk and cocoa",
    "pricePaise": 6000,
    "prepTimeMinutes": 5,
    "imageUrl": "/images/menu/cold-coffee.webp",
    "stockItemId": "stock_501"
  }
  ```

### 3.3 Update Menu Item / Toggle Availability
* **PATCH** `/api/v1/menu/:id`
* **Auth**: `ADMIN` (or `COUNTER` for `isAvailable` toggle only).
* **Request Body**:
  ```json
  {
    "pricePaise": 6500,
    "isAvailable": true
  }
  ```

---

## 4. Counter POS & Order Management

### 4.1 Create Order (Idempotent POS Checkout)
* **POST** `/api/v1/orders`
* **Auth**: `COUNTER` or `ADMIN`
* **Request Headers**: `X-Idempotency-Key: c9b2f6b8-1934-4b53-8d69-3286f37d1cf7`
* **Request Body**:
  ```json
  {
    "idempotencyKey": "c9b2f6b8-1934-4b53-8d69-3286f37d1cf7",
    "assignedToId": null,
    "items": [
      {
        "menuItemId": "menu_101",
        "quantity": 2,
        "notes": "Extra crispy"
      },
      {
        "menuItemId": "menu_202",
        "quantity": 1,
        "notes": null
      }
    ]
  }
  ```
* **Success (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "order": {
        "id": "ord_9901",
        "dailyOrderNumber": "CB-142",
        "status": "PLACED",
        "totalPaise": 21000,
        "customerVerificationPin": "4821",
        "initialEstimatedMinutes": 10,
        "createdAt": "2026-10-23T17:30:00.000Z",
        "items": [
          {
            "name": "Grilled Cheese Sandwich",
            "quantity": 2,
            "unitPricePaise": 7500,
            "subtotalPaise": 15000
          },
          {
            "name": "Cold Coffee (Large)",
            "quantity": 1,
            "unitPricePaise": 6000,
            "subtotalPaise": 6000
          }
        ]
      }
    }
  }
  ```
  *(Note: `customerVerificationPin` in plain text is returned strictly in the 201 response so counter staff can print/show it to the customer. In the database, it is stored as a secure hash).*

### 4.2 Mark Handed Over (Complete Order)
* **POST** `/api/v1/orders/:id/handover`
* **Auth**: `COUNTER` or `ADMIN`
* **Success (200 OK)**: Status moves to `COMPLETED`, persists `completedAt`.

### 4.3 Cancel Order
* **POST** `/api/v1/orders/:id/cancel`
* **Auth**: `COUNTER` (if status is `PLACED`) or `ADMIN` (if status is `PLACED` or `PREPARING`).
* **Request Body**:
  ```json
  {
    "reason": "Customer cancelled due to class schedule conflict"
  }
  ```
* **Success (200 OK)**: Status moves to `CANCELLED`, inventory restored if applicable.

---

## 5. Kitchen Operations (KDS)

### 5.1 Fetch Kitchen Queue
* **GET** `/api/v1/kitchen/queue`
* **Auth**: `KITCHEN` or `ADMIN`
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "unassigned": [ ... ],
      "preparing": [ ... ],
      "prepared": [ ... ]
    }
  }
  ```

### 5.2 Atomic Order Claim
* **POST** `/api/v1/kitchen/orders/:id/claim`
* **Auth**: `KITCHEN` or `ADMIN`
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "orderId": "ord_9901",
      "assignedTo": {
        "id": "chef_uuid",
        "name": "Chef Raj"
      },
      "status": "PLACED"
    }
  }
  ```
* **Conflict (409 Conflict)**: Returned if another cook claimed the ticket simultaneously:
  ```json
  {
    "success": false,
    "error": {
      "code": "ALREADY_CLAIMED",
      "message": "This order was already claimed by Chef Anita."
    }
  }
  ```

### 5.3 Start Preparation
* **POST** `/api/v1/kitchen/orders/:id/start-prep`
* **Auth**: `KITCHEN` or `ADMIN`
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "orderId": "ord_9901",
      "status": "PREPARING",
      "preparationStartedAt": "2026-10-23T17:35:00.000Z",
      "estimatedCompletionAt": "2026-10-23T17:45:00.000Z"
    }
  }
  ```

### 5.4 Adjust Preparation Time (+1, +3, +5, custom)
* **POST** `/api/v1/kitchen/orders/:id/adjust-time`
* **Auth**: `KITCHEN` or `ADMIN`
* **Request Body**:
  ```json
  {
    "minutesAdded": 3,
    "reason": "Grill preheat delay"
  }
  ```
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "orderId": "ord_9901",
      "minutesAdded": 3,
      "newEstimatedCompletionAt": "2026-10-23T17:48:00.000Z"
    }
  }
  ```

### 5.5 Mark as Prepared
* **POST** `/api/v1/kitchen/orders/:id/prepared`
* **Auth**: `KITCHEN` or `ADMIN`
* **Success (200 OK)**: Status moves to `PREPARED`, sets `preparedAt`.

---

## 6. Customer Order Tracking (Public)

### 6.1 Verify Order & Get Tracking Session
* **POST** `/api/v1/tracking/verify`
* **Auth**: None (Public rate-limited: 10 requests per minute per IP).
* **Request Body**:
  ```json
  {
    "dailyOrderNumber": "CB-142",
    "pin": "4821"
  }
  ```
* **Success (200 OK)**: Returns safe sanitized tracking state and a signed temporary `trackingToken`:
  ```json
  {
    "success": true,
    "data": {
      "trackingToken": "eyJh...signed_track_token...",
      "order": {
        "dailyOrderNumber": "CB-142",
        "status": "PREPARING",
        "initialEstimatedMinutes": 10,
        "preparationStartedAt": "2026-10-23T17:35:00.000Z",
        "estimatedCompletionAt": "2026-10-23T17:48:00.000Z",
        "items": [
          { "name": "Grilled Cheese Sandwich", "quantity": 2 },
          { "name": "Cold Coffee (Large)", "quantity": 1 }
        ]
      }
    }
  }
  ```
* **Error (401 Unauthorized)**:
  ```json
  {
    "success": false,
    "error": {
      "code": "INVALID_VERIFICATION",
      "message": "Invalid Order Number or PIN combination."
    }
  }
  ```
* **Error (429 Too Many Requests)**:
  ```json
  {
    "success": false,
    "error": {
      "code": "TOO_MANY_REQUESTS",
      "message": "Too many failed verification attempts. Please wait 1 minute before trying again."
    }
  }
  ```

### 6.2 Authoritative Tracking Status Sync
* **GET** `/api/v1/tracking/status`
* **Auth**: `Authorization: Bearer <trackingToken>`
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "order": {
        "id": "ord_9901",
        "dailyOrderNumber": "CB-142",
        "status": "PREPARING",
        "initialEstimatedMinutes": 10,
        "preparationStartedAt": "2026-10-23T17:35:00.000Z",
        "estimatedCompletionAt": "2026-10-23T17:48:00.000Z",
        "items": [
          { "name": "Grilled Cheese Sandwich", "quantity": 2 }
        ],
        "prepAdjustments": [
          { "minutesAdded": 3, "reason": "Rush order", "createdAt": "2026-10-23T17:38:00.000Z" }
        ]
      }
    }
  }
  ```

### 6.3 Public Cafeteria Display Board Data
* **GET** `/api/v1/tracking/board`
* **Auth**: None (Public unauthenticated)
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "board": {
        "preparing": ["CB-142", "CB-145"],
        "ready": ["CB-139", "CB-140"],
        "lastUpdated": "2026-10-23T17:40:00.000Z"
      }
    }
  }
  ```

---

## 7. Inventory & Operations API (Phase 5)

### 7.1 Inventory Overview
* **GET** `/api/v1/inventory/overview`
* **Auth**: `ADMIN`, `COUNTER`, `KITCHEN`
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "overview": {
        "totalStockItems": 12,
        "lowStockCount": 2,
        "outOfStockCount": 1,
        "healthyStockCount": 9,
        "recentMovements": [ ... ]
      }
    }
  }
  ```

### 7.2 List Stock Items
* **GET** `/api/v1/inventory` (or `/api/v1/inventory/stock-items`)
* **Auth**: `ADMIN`, `COUNTER`, `KITCHEN`
* **Query Params**: `search` (string), `lowStockOnly` (boolean), `outOfStockOnly` (boolean)
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "uuid",
          "name": "Burger Buns",
          "unit": "portions",
          "currentQuantity": 23,
          "lowStockThreshold": 10,
          "isLowStock": false,
          "isOutOfStock": false,
          "linkedMenuItemCount": 2,
          "createdAt": "2026-10-23T20:47:19.272Z",
          "updatedAt": "2026-10-23T20:48:00.000Z"
        }
      ]
    }
  }
  ```

### 7.3 Create Stock Item
* **POST** `/api/v1/inventory` (or `/api/v1/inventory/stock-items`)
* **Auth**: `ADMIN`
* **Payload**:
  ```json
  {
    "name": "Cold Brew Coffee",
    "unit": "bottles",
    "currentQuantity": 20,
    "lowStockThreshold": 5
  }
  ```
* **Success (201 Created)**

### 7.4 Update Stock Item Configuration
* **PUT** `/api/v1/inventory/:id` (or `/api/v1/inventory/stock-items/:id`)
* **Auth**: `ADMIN`
* **Payload**: `{ "name"?: string, "unit"?: string, "lowStockThreshold"?: number }`
* **Success (200 OK)**

### 7.5 Restock Inventory
* **POST** `/api/v1/inventory/:id/restock`
* **Auth**: `ADMIN`, `KITCHEN`
* **Payload**:
  ```json
  {
    "quantityAdded": 20,
    "note": "Fresh morning delivery"
  }
  ```
* **Success (200 OK)**: Returns updated stock item; generates `MANUAL_RESTOCK` movement ledger entry; emits real-time `STOCK_UPDATED` event.

### 7.6 Manual Adjustment / Spoilage / Waste
* **POST** `/api/v1/inventory/:id/adjust`
* **Auth**: `ADMIN`
* **Payload**:
  ```json
  {
    "quantityChange": -2,
    "reason": "Crushed in transit during delivery"
  }
  ```
* **Validation**: `quantityChange != 0`, `currentQuantity + quantityChange >= 0`, `reason >= 3 chars`.
* **Success (200 OK)**: Generates `MANUAL_ADJUSTMENT` movement ledger entry; emits real-time `STOCK_UPDATED` event.

### 7.7 Movement Ledger
* **GET** `/api/v1/inventory/movements?limit=100`
* **Auth**: `ADMIN`
* **Success (200 OK)**: Returns chronological immutable audit ledger with before/after quantities, staff actor, movement type, and notes.

---

## 8. Analytics & Reporting (Admin Only)

### 8.1 Dashboard Sales Summary
* **GET** `/api/v1/analytics/summary?period=today`
* **Auth**: `ADMIN`
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "grossSalesPaise": 1845000,
      "netSalesPaise": 1785000,
      "totalOrders": 92,
      "completedOrders": 88,
      "cancelledOrders": 4,
      "averageOrderValuePaise": 20054,
      "averagePrepDurationMinutes": 8.4
    }
  }
  ```

### 8.2 Daily Closing Report
* **GET** `/api/v1/analytics/daily-closing?date=2026-10-23`
* **Auth**: `ADMIN`
* **Success (200 OK)**: Full closing report detailing order counts, sales breakdown, cancellations with reasons, and item performance.

---

## 9. WebSocket (Socket.IO) Contract

### 9.1 Connection & Room Auth
* Staff clients connect with `Authorization: Bearer <token>` or session cookie.
* Customer clients connect and emit:
  `socket.emit('subscribe:order', { trackingToken })`
* Server validates the tracking token and admits the socket strictly to `order:<orderId>`.

### 9.2 Client Inbound / Server Outbound Events

```typescript
// Outbound from Server to Staff:Kitchen
interface OrderCreatedEvent {
  orderId: string;
  dailyOrderNumber: string;
  items: Array<{ name: string; quantity: number; notes?: string }>;
  initialEstimatedMinutes: number;
  createdAt: string;
}

// Outbound from Server to Staff & Customer
interface OrderStatusUpdatedEvent {
  orderId: string;
  dailyOrderNumber: string;
  status: 'PLACED' | 'PREPARING' | 'PREPARED' | 'COMPLETED' | 'CANCELLED';
  preparationStartedAt?: string;
  estimatedCompletionAt?: string;
  preparedAt?: string;
}

// Outbound from Server to Staff & Customer
interface OrderTimeAdjustedEvent {
  orderId: string;
  minutesAdded: number;
  newEstimatedCompletionAt: string;
  reason?: string;
}

// Outbound from Server to Staff:Admin & Staff:Counter (Phase 5 Inventory)
interface StockUpdatedEvent {
  stockItemId: string;
  currentQuantity: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

// Outbound from Server to Staff:Admin & Staff:Counter (Phase 5 Inventory)
interface StockLowAlertEvent {
  stockItemId: string;
  stockItemName: string;
  currentQuantity: number;
  threshold: number;
}

// Outbound from Server to Staff:Admin & Staff:Counter (Phase 5 Menu Availability)
interface MenuAvailabilityChangedEvent {
  menuItemId: string;
  isAvailable: boolean;
}
```
