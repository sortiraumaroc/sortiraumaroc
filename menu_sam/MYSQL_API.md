# MySQL API Documentation

## Setup

### 1. Prerequisites
- MySQL running on `localhost:3306`
- Database: `sam_site`
- User: `root` (no password)

### 2. Installation

```bash
# Dependencies already installed:
pnpm install
```

### 3. Create Tables

Run the migration to create all required tables:

```bash
# Option A: Using mysql CLI
mysql -h localhost -u root sam_site < prisma/migrations/create_new_tables.sql

# Option B: Using phpMyAdmin
# Import the SQL file manually
```

### 4. Environment Setup

Create or verify `.env.local`:

```env
DATABASE_URL="mysql://root:@localhost:3306/sam_site"
PRISMA_SKIP_VALIDATION_WARNING=true
```

### 5. Generate Prisma Client

```bash
pnpm prisma generate
```

---

## API Endpoints

Base URL: `http://localhost:5173/api/mysql`

### Health Check

```bash
GET /api/mysql/health

Response:
{
  "status": "ok",
  "database": "mysql"
}
```

---

## Orders API

### Get All Orders for a Place

```bash
GET /api/mysql/orders/:placeId

Example:
GET /api/mysql/orders/1

Response:
[
  {
    "id": "uuid",
    "establishmentId": 1,
    "tableNumber": 12,
    "joinCode": "ABC123",
    "status": "open",
    "kitchenStatus": "new",
    "serviceType": "sur_place",
    "createdAt": "2025-12-26T...",
    "orderItems": [
      {
        "id": "uuid",
        "menuItemId": 100,
        "quantity": 2,
        "price": 125.50,
        "menuItem": { ... }
      }
    ],
    "participants": [
      {
        "id": "uuid",
        "firstName": "Ahmed"
      }
    ]
  }
]
```

### Create Order

```bash
POST /api/mysql/orders

Body:
{
  "establishmentId": 1,
  "tableNumber": 12,
  "joinCode": "ABC123",
  "serviceType": "sur_place"
}

Response: (201 Created)
{
  "id": "new-uuid",
  "establishmentId": 1,
  "tableNumber": 12,
  ...
}
```

### Update Order

```bash
PATCH /api/mysql/orders/:orderId

Body:
{
  "kitchenStatus": "accepted",
  "paymentStatus": "paid",
  "discountAmount": 50.00
}

Response:
{
  "id": "uuid",
  "kitchenStatus": "accepted",
  ...
}
```

---

## Menu API

### Get Menu Categories for Place

```bash
GET /api/mysql/menu/:placeId

Example:
GET /api/mysql/menu/1

Response:
[
  {
    "menuCategoryId": 1,
    "title": "Appetizers",
    "priority": 0,
    "menuItems": [
      {
        "menuItemId": 100,
        "title": "Hummus",
        "price": 45.00,
        ...
      }
    ]
  }
]
```

### Get Menu Items by Category

```bash
GET /api/mysql/menu-items/:categoryId

Example:
GET /api/mysql/menu-items/1

Response:
[
  {
    "menuItemId": 100,
    "title": "Hummus",
    "description": "...",
    "price": 45.00,
    "label": "specialite",
    ...
  }
]
```

---

## Promos API

### Get Active Promos for Place

```bash
GET /api/mysql/promos/:placeId

Example:
GET /api/mysql/promos/1

Response:
[
  {
    "id": 1,
    "code": "LPB20",
    "discountType": "percent",
    "discountValue": 20,
    "description": "20% off all orders",
    "minOrderAmount": 0
  }
]
```

### Validate Promo Code

```bash
POST /api/mysql/promos/validate

Body:
{
  "placeId": 1,
  "code": "LPB20",
  "orderAmount": 250.50
}

Response:
{
  "code": "LPB20",
  "discountType": "percent",
  "discountValue": 20,
  "discount": 50.10,
  "description": "20% off all orders"
}

Error (404):
{
  "error": "Invalid or expired promo code"
}

Error (400):
{
  "error": "Minimum order amount: 100.00"
}
```

---

## Places API

### Get Place Details

```bash
GET /api/mysql/places/:placeId

Example:
GET /api/mysql/places/1

Response:
{
  "placeId": 1,
  "clientId": 5,
  "name": "Le Petit Braisé",
  "address": "Marrakech",
  "phone": "+212...",
  "email": "contact@...",
  "client": { ... },
  "promoCodes": [ ... ]
}
```

### Get All Places for Client

```bash
GET /api/mysql/places/client/:clientId

Example:
GET /api/mysql/places/client/5

Response:
[
  {
    "placeId": 1,
    "name": "Le Petit Braisé",
    ...
  }
]
```

### Create New Place

```bash
POST /api/mysql/places

Body:
{
  "clientId": 5,
  "name": "New Restaurant",
  "address": "123 Main St",
  "cityId": 1,
  "phone": "+212....",
  "email": "info@newrestaurant.com"
}

Response: (201 Created)
{
  "placeId": 2,
  "clientId": 5,
  ...
}
```

---

## Payments API

### Create Payment

```bash
POST /api/mysql/payments

Body:
{
  "orderId": "order-uuid",
  "amount": 250.50,
  "paymentMethod": "card",
  "transactionId": "txn_12345"
}

Response: (201 Created)
{
  "id": "payment-uuid",
  "orderId": "order-uuid",
  "amount": 250.50,
  "status": "pending",
  ...
}
```

### Update Payment Status

```bash
PATCH /api/mysql/payments/:paymentId

Body:
{
  "status": "completed"
}

Response:
{
  "id": "payment-uuid",
  "status": "completed",
  ...
}
```

---

## Data Models

### Order Status Values
- `open` - Order is open, customers can add items
- `locked` - Order is locked, no more items can be added
- `sent` - Order sent to kitchen
- `cancelled` - Order was cancelled

### Kitchen Status Values
- `new` - New order received
- `accepted` - Kitchen accepted the order
- `delayed` - Order is delayed
- `served` - Order has been served
- `cancelled` - Order was cancelled

### Payment Status Values
- `pending` - Payment pending
- `completed` - Payment completed
- `failed` - Payment failed
- `refunded` - Payment was refunded

### Promo Discount Types
- `percent` - Percentage discount (e.g., 20%)
- `amount` - Fixed amount discount (e.g., 50 DH)

---

## Error Handling

All endpoints follow standard HTTP status codes:

- `200 OK` - Success
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid input or constraints violated
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error response format:

```json
{
  "error": "Descriptive error message"
}
```

---

## Development

### Run Development Server

```bash
pnpm dev
```

API will be available at `http://localhost:5173/api/mysql`

### Database Tools

Access MySQL via:

```bash
# Using mysql CLI
mysql -h localhost -u root sam_site

# Using phpMyAdmin (if configured)
```

---

## Integration with Frontend

### Example: Create Order and Add Items

```typescript
// 1. Create order
const orderRes = await fetch('/api/mysql/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    establishmentId: 1,
    tableNumber: 12,
    joinCode: 'ABC123',
    serviceType: 'sur_place',
  }),
});

const order = await orderRes.json();

// 2. Add items to order
const itemRes = await fetch('/api/mysql/order-items', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    orderId: order.id,
    menuItemId: 100,
    quantity: 2,
    note: 'No onions',
  }),
});

// 3. Apply promo
const promoRes = await fetch('/api/mysql/promos/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    placeId: 1,
    code: 'LPB20',
    orderAmount: 250.50,
  }),
});

const discount = await promoRes.json();
console.log(`Discount: ${discount.discount} DH`);
```

---

## Migration Path

### From Supabase to MySQL

If migrating from Supabase (PostgreSQL):

1. Both Supabase and MySQL endpoints will be available simultaneously
2. Use `/api/mysql/*` for MySQL endpoints
3. Use `/api/supabase/*` for Supabase endpoints (existing)
4. Gradually migrate client code to use MySQL
5. Keep Supabase as fallback until migration is complete

---

## Support & Troubleshooting

### Connection Issues

```bash
# Test MySQL connection
mysql -h localhost -u root sam_site -e "SELECT 1"

# Check .env.local is set correctly
cat .env.local
```

### Prisma Issues

```bash
# Regenerate client
pnpm prisma generate

# Clear Prisma cache
rm -rf node_modules/.prisma
pnpm prisma generate
```

### API Not Responding

```bash
# Check health endpoint
curl http://localhost:5173/api/mysql/health

# Check server logs
pnpm dev
```

---

## Next Steps

1. ✅ Run migration to create tables
2. ✅ Start dev server (`pnpm dev`)
3. ✅ Test `/api/mysql/health` endpoint
4. ✅ Create initial places and menu items
5. ✅ Integrate with frontend components
6. ✅ Add JWT authentication for PRO routes
7. ✅ Add input validation and error handling

---

**Last Updated**: 2025-12-26
**Prisma Version**: 6.19.1
**MySQL Version**: 5.7+
