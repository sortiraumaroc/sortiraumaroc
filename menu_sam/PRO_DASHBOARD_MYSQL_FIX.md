# PRO Dashboard: Migrated from Supabase to MySQL

## Problem
The PRO Dashboard was crashing with the error:
```
Uncaught Error: Supabase is not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.
```

This occurred because:
1. The Dashboard was trying to initialize a Supabase client at startup
2. Supabase environment variables were not available (old setup)
3. The app now uses MySQL backend exclusively

## Solution
Completely removed Supabase from the PRO Dashboard and replaced it with MySQL API calls.

### Changes Made

#### 1. **Removed Supabase Imports** (Dashboard.tsx:1-12)
**Before:**
```typescript
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getProSupabaseClient, PRO_ESTABLISHMENT_ID } from "@/lib/pro-supabase";
```

**After:**
```typescript
import { PRO_ESTABLISHMENT_ID } from "@/lib/pro-supabase";
```
✅ Kept only the constant export, removed the client initialization

---

#### 2. **Removed Supabase Client from ProDashboard** (Dashboard.tsx:370-376)
**Before:**
```typescript
const supabase = React.useMemo(() => getProSupabaseClient(), []);
```

**After:**
```typescript
// Removed - using MySQL API instead
```
✅ No longer tries to initialize a Supabase client

---

#### 3. **Replaced loadOrders Function** (Dashboard.tsx:404-450)
**Before:**
```typescript
const res = await supabase
  .from("qr_table_orders")
  .select(...)
  .eq("establishment_id", establishmentId)
  .order("created_at", { ascending: false })
  .limit(50);
```

**After:**
```typescript
const response = await fetch(`/api/mysql/orders/${placeId}`);
const data = await response.json();

// Transform MySQL commandes format to QrOrderRow format
const transformedOrders: QrOrderRow[] = data.map((order: any) => ({
  id: String(order.id),
  establishment_id: String(order.placeId),
  table_number: order.tableNumber || order.nbrTable || 0,
  join_code: order.joinCode || "",
  status: order.status || "open",
  payment_status: order.paymentStatus || "",
  payment_method: order.paymentMethod || "",
  discount_amount: order.discountAmount || 0,
  service_type: (order.serviceType || "sur_place") as ServiceType,
  kitchen_status: (order.kitchenStatus || "new") as KitchenStatus,
  delayed_until: null,
  kitchen_note: order.comment || "",
  kitchen_updated_at: order.updatedAt?.toString() || new Date().toISOString(),
  created_at: order.dateCreation?.toString() || new Date().toISOString(),
}));
```
✅ Now fetches from MySQL API with proper field mapping

---

#### 4. **Replaced Realtime Subscription with Polling** (Dashboard.tsx:466-518)
**Before:**
```typescript
const channel = supabase
  .channel(`pro_qr_orders_${establishmentId}`)
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "qr_table_orders", ... },
    (payload) => { /* handle new orders */ }
  )
  .subscribe();
```

**After:**
```typescript
const interval = setInterval(async () => {
  // Fetch orders every 2 seconds
  const response = await fetch(`/api/mysql/orders/${placeId}`);
  const newOrders = /* ... transform data ... */;
  
  // Detect new orders and play notifications
  const newOrdersList = newOrders.filter(o => !previousIds.has(o.id));
  if (newOrdersList.length > 0) {
    playNewOrderSound();
    toast.success(`Nouvelle commande reçue — Table ${table_number}`);
  }
  
  setOrders(newOrders);
}, 2000);
```
✅ Now polls MySQL API every 2 seconds for updates
✅ Detects new orders and plays notifications

---

#### 5. **Updated OrderRow Component** (Dashboard.tsx:140-190)
**Before:**
```typescript
const supabase = React.useMemo(() => getProSupabaseClient(), []);
const res = await supabase
  .from("qr_table_order_events")
  .select(...)
  .eq("order_id", order.id);
```

**After:**
```typescript
// Events not currently in MySQL schema
const loadEvents = React.useCallback(async () => {
  setEventsLoading(true);
  try {
    setEvents([]); // Placeholder for future implementation
  } finally {
    setEventsLoading(false);
  }
}, []);
```
✅ Removed events (not in current MySQL schema)
✅ Simplified for future implementation

**Order Updates:**
```typescript
// Before: supabase.from("qr_table_orders").update(patch).eq("id", order.id)

// After:
const response = await fetch(`/api/mysql/orders/${order.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kitchenStatus: patch.kitchen_status,
    status: patch.status,
    paymentStatus: patch.payment_status,
    paymentMethod: patch.payment_method,
    discountAmount: patch.discount_amount,
    comment: patch.kitchen_note,
  }),
});
```
✅ Now uses MySQL API endpoint with proper field mapping

---

## Data Flow

### Loading Orders
```
ProDashboard
  ↓
loadOrders()
  ↓
fetch("/api/mysql/orders/{placeId}")  [MySQL API]
  ↓
Transform MySQL format → QrOrderRow format
  ↓
setOrders(transformedOrders)
```

### Real-time Updates
```
Polling Interval (2 seconds)
  ↓
fetch("/api/mysql/orders/{placeId}")
  ↓
Compare order IDs
  ↓
If new orders detected:
  - Play sound notification
  - Show toast message
  - Update orders list
```

### Updating Order Status
```
OrderRow component
  ↓
updateOrder(patch)
  ↓
fetch("/api/mysql/orders/{orderId}", { method: "PATCH" })
  ↓
MySQL API updates commande record
  ↓
Call onUpdate callback
  ↓
Update UI
```

---

## Testing

### Test 1: PRO Dashboard Loads
1. Go to `http://localhost:8080` → footer → "Accéder à l'interface PRO"
2. Expected: ✅ Dashboard loads without Supabase error
3. Expected: ✅ Shows "Connecté: contact@lepetitbraise.com" (or your login email)

### Test 2: Orders Load from MySQL
1. In PRO Dashboard, verify:
2. Expected: ✅ Orders list shows (if any exist in database)
3. Expected: ✅ Order details show: Table number, Status, Kitchen status, etc.
4. Expected: ✅ Data comes from MySQL database (not demo data)

### Test 3: Order Updates Work
1. Click on an order in the list
2. Click "Accepter" or "Servir" button
3. Expected: ✅ Kitchen status updates in MySQL database
4. Expected: ✅ Toast notification shows success

### Test 4: Polling Updates
1. Open PRO Dashboard
2. In another browser/tab, create a new order (from customer QR code)
3. Expected: ✅ Within 2 seconds, new order appears in dashboard
4. Expected: ✅ Sound notification plays (if enabled)
5. Expected: ✅ Toast notification shows "Nouvelle commande reçue"

### Test 5: Filters Work
1. Use "Table" filter to search for specific table number
2. Use "Service" filter to show only "Sur place", "À emporter", or "Livraison"
3. Expected: ✅ Filters work correctly

---

## API Endpoints Used

The PRO Dashboard now relies on these MySQL API endpoints:

### Get Orders
```
GET /api/mysql/orders/{placeId}
Response: Array of commande objects
```

### Update Order
```
PATCH /api/mysql/orders/{orderId}
Body: {
  kitchenStatus?: "new" | "accepted" | "delayed" | "cancelled" | "served",
  status?: "open" | "locked" | "sent" | "cancelled",
  paymentStatus?: string,
  paymentMethod?: string,
  discountAmount?: number,
  comment?: string
}
```

---

## Known Limitations

1. **Events Not Implemented**
   - Events table doesn't exist in current MySQL schema
   - Placeholder for future implementation
   - Comment history is available via the `comment` field in orders

2. **Audio Context**
   - Requires user interaction to unlock (browser security)
   - Only plays after user clicks on the page

3. **Polling vs Realtime**
   - 2-second polling is sufficient for kitchen displays
   - More responsive than webhook polling
   - Can be tuned based on performance needs

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Dashboard still shows error | Clear browser cache, restart dev server |
| Orders don't load | Check if MySQL is running and database connection is correct |
| Orders don't update | Verify `/api/mysql/orders/{orderId}` endpoint is working |
| Sound doesn't play | Check browser autoplay settings, click on page first |
| New orders don't appear | Check polling interval is working (2 seconds) |

---

## Next Steps

1. ✅ Test PRO Dashboard with MySQL
2. ⏳ Implement events table (if needed)
3. ⏳ Optimize polling frequency based on load
4. ⏳ Add WebSocket realtime if needed for better responsiveness

---

**Status:** ✅ PRO Dashboard now works with MySQL only, no Supabase required!
