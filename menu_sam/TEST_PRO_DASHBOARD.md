# Quick Test: PRO Dashboard with MySQL

## ✅ What's Fixed

The PRO Dashboard no longer requires Supabase. It now:
- ✅ Loads orders from MySQL (`/api/mysql/orders/{placeId}`)
- ✅ Polls for updates every 2 seconds
- ✅ Detects new orders and plays notifications
- ✅ Updates order status via MySQL API

---

## 🧪 Step 1: Test Dashboard Loads

1. Navigate to: `http://localhost:8080`
2. Scroll to footer → Click "Accéder à l'interface PRO"
3. Login with credentials:
   - Email: `contact@lepetitbraise.com`
   - Password: `Petitbraise2025!`

**Expected Result:**
- ✅ Dashboard loads without Supabase error
- ✅ Shows "Connecté: contact@lepetitbraise.com"
- ✅ No console errors about missing VITE_SUPABASE_*

---

## 🧪 Step 2: Test Orders Load from MySQL

In the PRO Dashboard:

1. Check if "Commandes" section shows any orders
2. If you have orders in MySQL, they should appear in the list
3. Verify each order shows:
   - Table number
   - Service type (Sur place, À emporter, Livraison)
   - Status (Open, Sent, etc.)
   - Kitchen status (New, Accepted, Served, etc.)

**Expected Result:**
- ✅ Orders list populates from MySQL
- ✅ All order details display correctly
- ✅ Orders are sorted by creation date (newest first)

---

## 🧪 Step 3: Test Order Status Updates

1. Click on an order in the list to see details
2. Click one of these buttons:
   - "✓ Accepter" (accept order)
   - "Servir" (mark as served)
   - "⊘ Annuler" (cancel order)

**Expected Result:**
- ✅ Kitchen status updates immediately in the UI
- ✅ Toast notification shows success
- ✅ Changes persist in MySQL database

**Verify in Database:**
```sql
SELECT id, kitchen_status, status FROM commandes ORDER BY id DESC LIMIT 1;
```
Should show the updated status.

---

## 🧪 Step 4: Test Real-time Polling (Optional)

This test requires creating a new order while watching the dashboard:

1. Open PRO Dashboard in one tab
2. Open another tab with the customer menu (`http://localhost:8080`)
3. Create a new order by:
   - Entering table number
   - Selecting some items
   - Submitting the order

**Expected Result (in PRO Dashboard tab):**
- ✅ Within 2-3 seconds, new order appears in the list
- ✅ Sound notification plays (if enabled)
- ✅ Toast shows: "Nouvelle commande reçue — Table X"

---

## 🧪 Step 5: Test Filters

1. Type a table number in the "Table" filter
2. Select a service type from the "Service" dropdown

**Expected Result:**
- ✅ Order list filters correctly
- ✅ Only matching orders are displayed

---

## ❌ Troubleshooting

### Issue: Still getting Supabase error
**Solution:**
- Clear browser cache (Ctrl+Shift+Delete)
- Restart dev server (npm run dev)
- Check console for error details

### Issue: Orders don't appear
**Possible causes:**
- No orders in MySQL database
- Incorrect `PRO_ESTABLISHMENT_ID`
- Database connection issue

**To verify:**
```bash
# Check if orders exist in MySQL
mysql -u root sam_site -e "SELECT id, place_id, nbr_table FROM commandes LIMIT 5;"
```

### Issue: Updates don't work
**Solution:**
- Check browser console for fetch errors
- Verify `/api/mysql/orders/{orderId}` endpoint
- Test with curl:
```bash
curl -X PATCH http://localhost:5173/api/mysql/orders/1 \
  -H "Content-Type: application/json" \
  -d '{"kitchenStatus":"accepted"}'
```

### Issue: New orders don't appear immediately
**Expected:** 2-second delay (polling interval)
- Check browser Network tab to see polling requests
- Each should be a GET request to `/api/mysql/orders/{placeId}`
- Should see 2-3 requests per 5 seconds

---

## 📊 Verify API Endpoints

You can test the MySQL API endpoints directly:

### Get Orders
```bash
curl http://localhost:5173/api/mysql/orders/1
```
Should return array of orders.

### Update Order
```bash
curl -X PATCH http://localhost:5173/api/mysql/orders/1 \
  -H "Content-Type: application/json" \
  -d '{
    "kitchenStatus": "accepted",
    "status": "open"
  }'
```
Should return updated order.

---

## ✨ Success Checklist

When everything works:
- ✅ Dashboard loads without Supabase error
- ✅ Orders appear from MySQL database
- ✅ Order status updates work
- ✅ New orders appear within 2 seconds
- ✅ Filters work correctly
- ✅ Toast notifications appear for new orders

---

## 📝 Notes

- **Polling Interval:** 2 seconds (can be adjusted if needed)
- **Sound Notification:** Requires user interaction first (browser security)
- **Events:** Not currently stored in MySQL (comment field used instead)
- **Database:** Uses `commandes` table from your existing MySQL schema

---

Once all tests pass, the PRO Dashboard is fully functional with MySQL! 🚀

For more details, see: `PRO_DASHBOARD_MYSQL_FIX.md`
