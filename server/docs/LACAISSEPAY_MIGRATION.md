# PayMa → LacaissePay Migration

## Summary

Successfully replaced PayMa payment provider with **LacaissePay** (Moroccan payment gateway).

**Completion Date**: 2024-01-21  
**Build Status**: ✅ Pass  
**TypeScript Check**: ✅ Pass

---

## Files Changed

### New Files Created

1. **`client/lib/lacaissepay.ts`** (126 lines)
   - Client-side integration library
   - Functions: `createLacaissePaySession()`, `buildLacaissePayCheckoutUrl()`, `requestLacaissePayCheckoutUrl()`

2. **`server/routes/lacaissepay.ts`** (193 lines)
   - Server-side session creation endpoint
   - Webhook payload parser
   - DEV/PROD endpoint routing

3. **`server/docs/LACAISSEPAY_ENV.md`** (79 lines)
   - Environment variables documentation
   - Testing checklist

4. **`server/docs/PAYMENTS_LACAISSEPAY.md`** (219 lines)
   - Complete integration guide
   - Payment flow diagram
   - Troubleshooting guide

5. **`server/docs/LACAISSEPAY_MIGRATION.md`** (this file)
   - Migration summary

### Modified Files

1. **`server/index.ts`**
   - Added import: `import { createLacaissePaySession } from "./routes/lacaissepay"`
   - Added route: `app.post("/api/payments/lacaissepay/session", createLacaissePaySession)`

2. **`client/pages/BookingDetails.tsx`**
   - Replaced: `import { buildPaymaPaymentUrl } from "@/lib/payma"`
   - With: `import { requestLacaissePayCheckoutUrl } from "@/lib/lacaissepay"`
   - Updated: `handlePayDeposit()` function to use LacaissePay flow

3. **`client/components/booking/Step3Info.tsx`**
   - Replaced: `import { buildPaymaPaymentUrl } from "@/lib/payma"`
   - With: `import { requestLacaissePayCheckoutUrl } from "@/lib/lacaissepay"`
   - Updated: `handleContinue()` function to use LacaissePay flow

### Unchanged

**`client/lib/payma.ts`** remains in codebase (safe to delete if confirmed old payments won't be needed)

---

## Key Changes

### Payment Flow

**Before (PayMa)**:

```
1. Frontend calculates amount
2. Frontend builds simple URL: https://pay.ma/{phone}/{amount}
3. Frontend opens URL in new tab
4. User pays
5. User returns
6. No server-side verification
```

**After (LacaissePay)**:

```
1. Frontend calculates amount + collects customer details
2. Frontend calls POST /api/payments/lacaissepay/session
3. Backend creates session on LacaissePay API
4. Backend returns sessionId + sessionToken
5. Frontend builds checkout URL with session + config
6. Frontend opens URL in new tab
7. User pays on LacaissePay checkout
8. LacaissePay calls webhook: POST /api/payments/webhook
9. Backend updates payment status (server source of truth)
```

### Environment Variables Required

```env
# Client-side
VITE_LACAISSEPAY_CHECKOUT_URL=https://pay.lacaissepay.ma    # PROD
VITE_LACAISSEPAY_CHECKOUT_URL=https://paydev.lacaissepay.ma # DEV

# Server-side
LACAISSEPAY_DEV_PHONE=+212611159538  # DEV only, override customer phone
PAYMENTS_WEBHOOK_KEY=your_key        # Auth for webhook notifications
PUBLIC_BASE_URL=https://sambooking.ma
```

---

## Integration Points

### 1. Booking Deposit Payment (Step 3)

- **File**: `client/components/booking/Step3Info.tsx`
- **Function**: `handleContinue()`
- **Flow**:
  - User enters contact info
  - System calculates deposit amount
  - Calls `requestLacaissePayCheckoutUrl()`
  - Opens checkout in new tab
  - Payment processed asynchronously

### 2. Existing Booking - Pay Balance

- **File**: `client/pages/BookingDetails.tsx`
- **Function**: `handlePayDeposit()`
- **Flow**:
  - User clicks "Pay Deposit"
  - Calls `requestLacaissePayCheckoutUrl()`
  - Opens checkout in new tab
  - Webhook confirms payment

### 3. Unified Webhook Handler

- **File**: `server/routes/payments.ts`
- **Function**: `handlePaymentsWebhook()`
- **Behavior**:
  - Accepts webhooks from any provider (LacaissePay, etc.)
  - Parses LacaissePay format via `parseLacaissePayWebhook()`
  - Updates payment status in database
  - Triggers notifications & emails

---

## Testing Checklist

- [ ] Set environment variables in `.env`
- [ ] Verify DEV endpoint: `https://sessiondev.lacaissepay.ma/storePaymentData`
- [ ] Verify PROD endpoint: `https://pay.lacaissepay.ma/storePaymentData`
- [ ] Test DEV flow:
  - [ ] Create booking
  - [ ] Initiate deposit payment
  - [ ] Complete payment on LacaissePay
  - [ ] Verify webhook received
  - [ ] Confirm payment status = "paid" in database
- [ ] Test PROD flow (if applicable)
- [ ] Run full test suite: `pnpm test`
- [ ] Verify build: `pnpm run build`

---

## Rollback Plan

If needed to revert to PayMa:

1. Restore `client/pages/BookingDetails.tsx` — use PayMa import + `buildPaymaPaymentUrl()`
2. Restore `client/components/booking/Step3Info.tsx` — use PayMa import + `buildPaymaPaymentUrl()`
3. Remove new files: `server/routes/lacaissepay.ts`
4. Revert `server/index.ts` — remove LacaissePay route + import
5. Update environment variables back to PayMa

Git history preserved — can use `git revert` to undo changes if needed.

---

## Deployment Steps

1. **Staging**:
   - Add environment variables
   - Deploy code changes
   - Test full payment flow
   - Monitor webhook logs

2. **Production**:
   - Update `PUBLIC_BASE_URL` in production environment
   - Update `VITE_LACAISSEPAY_CHECKOUT_URL` to PROD endpoint
   - Deploy during low-traffic window
   - Have support team standing by
   - Monitor error rates and logs

---

## Support

### For Developers

- See `server/docs/PAYMENTS_LACAISSEPAY.md` for complete implementation guide
- See `server/docs/LACAISSEPAY_ENV.md` for environment variables
- LacaissePay docs: https://api-legacy.lacaisse.ma/documentationlacaissepay.php

### For Support Team

- Payment webhook endpoint: `POST /api/payments/webhook`
- Session creation endpoint: `POST /api/payments/lacaissepay/session`
- Webhook auth header: `x-webhook-key` (must match `PAYMENTS_WEBHOOK_KEY`)
- DEV phone requirement: Must use `+212611159538` in DEV environment

---

## Verification

✅ TypeScript compilation: PASS  
✅ Build: PASS  
✅ Code review ready  
✅ Documentation complete

Ready for deployment after environment variable configuration.
