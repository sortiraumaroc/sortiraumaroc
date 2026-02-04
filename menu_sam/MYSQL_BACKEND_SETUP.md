# MySQL Backend Implementation - Setup Guide

## ✅ What's Been Done

### 1. **Prisma ORM Configuration** ✅
- ✅ Installed Prisma 6 + MySQL driver
- ✅ Created comprehensive schema in `prisma/schema.prisma`
- ✅ Generated Prisma Client
- ✅ Configured environment variables in `.env.local`

### 2. **Database Schema** ✅
All tables defined and ready to create:

**Existing Tables (mapped)**
- `client` - Restaurant owners/managers
- `menu_category` - Menu categories
- `menu_item` - Menu items  
- `vote_menu` - Customer votes
- `promo_codes` - Promotional codes

**New Tables (to create)**
- `city` - Cities
- `place` - Restaurants/establishments
- `qr_tables` - QR code tables
- `qr_table_orders` - Customer orders
- `qr_table_order_items` - Order line items
- `qr_table_participants` - Order participants
- `qr_table_order_events` - Order event history
- `payments` - Payment records
- `users_pro` - PRO dashboard users

### 3. **Express API Routes** ✅
All endpoints implemented in `server/routes/mysql-api.ts`:

**Orders Management** 
- `GET /api/mysql/orders/:placeId` - Get all orders
- `POST /api/mysql/orders` - Create new order
- `PATCH /api/mysql/orders/:orderId` - Update order status
- `POST /api/mysql/order-items` - Add item to order

**Menu Management**
- `GET /api/mysql/menu/:placeId` - Get menu categories
- `GET /api/mysql/menu-items/:categoryId` - Get items by category

**Promos Management**
- `GET /api/mysql/promos/:placeId` - Get active promo codes
- `POST /api/mysql/promos/validate` - Validate & calculate discount

**Places Management**
- `GET /api/mysql/places/:placeId` - Get place details
- `GET /api/mysql/places/client/:clientId` - Get client's places
- `POST /api/mysql/places` - Create new place

**Payments Management**
- `POST /api/mysql/payments` - Create payment record
- `PATCH /api/mysql/payments/:paymentId` - Update payment status

**Health Check**
- `GET /api/mysql/health` - API health status

### 4. **Integration** ✅
- ✅ Routes integrated into `server/index.ts`
- ✅ Prisma client utility created (`server/lib/prisma.ts`)
- ✅ TypeScript compilation passes
- ✅ UUID package installed for ID generation

---

## 🚀 Next Steps

### Step 1: Create Database Tables

**Using MySQL CLI:**
```bash
mysql -h localhost -u root sam_site < prisma/migrations/create_new_tables.sql
```

**Or using phpMyAdmin:**
1. Open phpMyAdmin
2. Select database `sam_site`
3. Go to "SQL" tab
4. Paste content from `prisma/migrations/create_new_tables.sql`
5. Click "Execute"

### Step 2: Verify Setup

```bash
# Test health endpoint
curl http://localhost:5173/api/mysql/health

# Expected response:
# {"status":"ok","database":"mysql"}
```

### Step 3: Create Initial Data

```bash
# Option A: Using MySQL
mysql -h localhost -u root sam_site << EOF
INSERT INTO city (name, country) VALUES ('Marrakech', 'Morocco');
INSERT INTO place (client_id, name, address, city_id, phone, email) 
VALUES (1, 'Le Petit Braisé', 'Downtown Marrakech', 1, '+212123456789', 'contact@lepetitbraise.com');
EOF

# Option B: Using API
curl -X POST http://localhost:5173/api/mysql/places \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": 1,
    "name": "Le Petit Braisé",
    "address": "Downtown Marrakech",
    "cityId": 1,
    "phone": "+212123456789",
    "email": "contact@lepetitbraise.com"
  }'
```

### Step 4: Update Frontend

Connect your frontend to use MySQL API:

```typescript
// client/hooks/use-mysql-orders.ts (example)
import { useQuery } from '@tanstack/react-query';

export function useOrders(placeId: number) {
  return useQuery({
    queryKey: ['orders', placeId],
    queryFn: async () => {
      const res = await fetch(`/api/mysql/orders/${placeId}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
  });
}
```

---

## 📚 Documentation

Detailed API documentation available in:
- `MYSQL_API.md` - Complete API reference with examples
- `prisma/schema.prisma` - Database schema definition
- `server/routes/mysql-api.ts` - Source code

---

## 🔧 Configuration

### Current Setup
- **Database**: MySQL
- **Host**: localhost
- **Port**: 3306
- **Database**: sam_site
- **User**: root
- **Password**: (empty)

### Modify Connection

Edit `.env.local`:
```env
DATABASE_URL="mysql://username:password@host:port/database"
```

Then regenerate Prisma client:
```bash
pnpm prisma generate
```

---

## 🎯 Architecture Overview

```
Frontend (React)
    ↓
Express Server (Node.js)
    ├── /api/mysql/* (MySQL endpoints)
    │   └── server/routes/mysql-api.ts
    ├── /api/supabase/* (Supabase endpoints - existing)
    └── /api/pro/* (PRO dashboard - existing)
    ↓
Database Layer
    ├── Prisma ORM (server/lib/prisma.ts)
    └── MySQL Database
```

---

## 🔐 Security Considerations

### Before Production:

1. **Input Validation**
   - Add validation for all POST/PATCH endpoints
   - Use libraries like `zod` or `joi`

2. **Authentication**
   - Add JWT middleware for PRO routes
   - Protect sensitive endpoints

3. **Authorization**
   - Verify user has access to place
   - Check role-based permissions

4. **Error Handling**
   - Don't expose internal errors to client
   - Log errors securely

Example middleware (to add):
```typescript
// server/middleware/validate-place-access.ts
export async function validatePlaceAccess(placeId: number, userId: string) {
  const place = await prisma.place.findUnique({
    where: { placeId },
    include: { client: true }
  });
  if (!place) throw new Error('Place not found');
  // Verify user has access to this place
}
```

---

## 📊 Testing API

### Using cURL

```bash
# Health check
curl http://localhost:5173/api/mysql/health

# Get orders
curl http://localhost:5173/api/mysql/orders/1

# Create order
curl -X POST http://localhost:5173/api/mysql/orders \
  -H "Content-Type: application/json" \
  -d '{"establishmentId":1,"tableNumber":12,"joinCode":"ABC123"}'
```

### Using Postman/Insomnia

1. Import collection from API docs
2. Set variables: `{{host}}`, `{{placeId}}`, etc.
3. Run requests

---

## ⚠️ Important Notes

### Dual Database Setup

Your app now has TWO databases:
- **Supabase (PostgreSQL)** - Existing implementation
- **MySQL** - New implementation

Both can coexist. Gradually migrate to MySQL as needed.

### UUID Generation

All new records use UUID v4 for IDs:
```typescript
import { v4 as uuidv4 } from 'uuid';
const id = uuidv4(); // "550e8400-e29b-41d4-a716-446655440000"
```

### Decimal Handling

Prices/amounts use Prisma `Decimal` type:
```typescript
const order = await prisma.qrTableOrder.update({
  data: { discountAmount: new Decimal('50.00') }
});
```

---

## 🐛 Troubleshooting

### Issue: "Database connection failed"
```bash
# Check MySQL is running
mysql -h localhost -u root sam_site -e "SELECT 1"

# Check .env.local
cat .env.local

# Regenerate Prisma client
pnpm prisma generate
```

### Issue: "Table does not exist"
```bash
# Run migration again
mysql -h localhost -u root sam_site < prisma/migrations/create_new_tables.sql

# Verify tables
mysql -h localhost -u root sam_site -e "SHOW TABLES;"
```

### Issue: "EADDRINUSE - Port already in use"
```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use different port
PORT=3001 pnpm dev
```

---

## 📝 Files Created/Modified

**New Files:**
- ✅ `.env.local` - Environment variables
- ✅ `prisma/schema.prisma` - Database schema
- ✅ `prisma/prisma.config.ts` - Prisma configuration
- ✅ `prisma/migrations/create_new_tables.sql` - SQL migration
- ✅ `server/lib/prisma.ts` - Prisma client utility
- ✅ `server/routes/mysql-api.ts` - Express API routes
- ✅ `MYSQL_API.md` - API documentation
- ✅ `MYSQL_BACKEND_SETUP.md` - This file

**Modified Files:**
- ✅ `server/index.ts` - Added MySQL routes
- ✅ `package.json` - Added dependencies (via pnpm)

---

## ✨ What You Can Do Now

### 1. Manage Orders
- Create, read, update orders
- Track kitchen status (new → accepted → served)
- Handle order delays and cancellations
- Record order events/history

### 2. Manage Menu
- Get menu categories and items
- Check availability
- Manage pricing

### 3. Manage Promos
- Create/update promo codes
- Validate codes with minimum order amounts
- Calculate discounts (percent or fixed amount)

### 4. Manage Payments
- Record payment transactions
- Update payment status
- Track payment methods

### 5. Manage Places
- Create new restaurant locations
- Associate with clients
- Store contact info and metadata

---

## 🎓 Learning Resources

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Express.js Guide](https://expressjs.com/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## 🚀 Next Phase

Ready to add:
1. JWT authentication for PRO routes
2. Input validation middleware
3. Advanced filtering & pagination
4. Realtime notifications (WebSocket)
5. File uploads (images/videos)
6. Email notifications

---

**Status**: ✅ Ready for Development
**Created**: 2025-12-26
**Version**: 1.0

For questions or issues, check `MYSQL_API.md` for detailed endpoint documentation.
