# Table Join Detection System

## Problem
When a customer scans a QR code for a table, we need to detect if other people are already ordering at that table, so we can prompt them to join the shared session instead of creating a new one.

## Solution

### Detection Logic
When someone scans a QR code with `?table=12`:

1. **Check for Open Orders** (commandes table)
   - Look for an open/active order for that table number
   - If found → Show "needs_join" dialog

2. **Check for Active Pre-Carts** (table_carts table) 
   - Look for items with `createdAt >= (now - 15 minutes)`
   - If found → Show "needs_join" dialog
   - This detects people actively pre-ordering

3. **If both checks fail**
   - Create a new order for this table
   - First person gets ready state

### Backend Endpoint

**GET `/api/mysql/table-carts/:placeId/:tableNumber/active`**

Returns:
```json
{
  "hasActive": true,
  "count": 2,
  "items": [
    {
      "id": 1,
      "menuItemId": 5,
      "quantity": 2,
      "firstName": "Ahmed",
      "createdAt": "2025-01-09T10:00:00Z"
    }
  ]
}
```

**Criteria:**
- Items added within last 15 minutes
- Quantity > 0 (not deleted)
- Same table & place

### Frontend Flow (useQrTableOrder)

```
User scans QR → Check for open orders
    ↓ (none found)
Check for active carts (≤ 15 mins old)
    ↓ (found items)
Show "needs_join" dialog
    ↓ (user clicks Join)
Create order for this person
Join the shared pre-cart session
```

### What Happens When They Join

1. Click "Rejoindre la commande" button
2. A new order is created for this person
3. They're added as a participant
4. They see the shared pre-cart (`table_carts`)
5. 15-minute countdown starts
6. On submit → All table carts cleared

## Example Scenario

**Person A scans table 5 at 10:00 AM**
- No open orders found
- No active carts found
- Creates new order ✓

**Person A adds items to cart at 10:05 AM**
- Items saved to table_carts table

**Person B scans table 5 at 10:12 AM**
- No open orders found
- ✅ Active carts found! (Person A's items from 10:05)
- Shows join dialog
- Person B clicks "Join"
- New order created for Person B
- Both now see each other's carts in real-time

**At 10:17 AM (cart expires)**
- 15 minutes passed
- All table_carts for table 5 auto-cleared
- Countdown resets

**OR Person B submits first at 10:15**
- Order created
- All items moved to commandes_products
- ALL table_carts cleared immediately
- Person A sees empty cart
- Must add items again or it's gone

## Time Windows

- **Detection window**: Items created within last 15 minutes
- **Cart lifetime**: Items auto-clear after 15 minutes of inactivity
- **Submission**: Clears all carts immediately for that table

## Benefits

✅ Detects people actively ordering (not just completed orders)
✅ Works with pre-cart system (temporary storage)
✅ 15-minute window handles realistic ordering scenarios
✅ Clear join prompts instead of silent failures
✅ Auto-cleanup prevents stale data
