# Sam'Booking — LacaissePay Payment Integration

This document describes the complete integration of LacaissePay as the payment provider for Sam'Booking (replacing PayMa).

## Overview

LacaissePay handles payment processing for:

- **Booking deposits** (restaurant & hotel reservations)
- **Pack purchases** (add-on services)
- **Visibility orders** (PRO features)

## Architecture

### Payment Flow

```
1. User initiates payment
   ├─ BookingDetails.tsx (handlePayDeposit) or
   └─ Step3Info.tsx (handleContinue with payment)

2. Frontend calls POST /api/payments/lacaissepay/session
   ├─ Creates session on LacaissePay API
   └─ Returns sessionId + sessionToken

3. Frontend redirects to LacaissePay checkout
   ├─ https://pay.lacaissepay.ma (PROD)
   └─ https://paydev.lacaissepay.ma (DEV)

4. User completes payment

5. LacaissePay sends webhook notification
   ├─ POST /api/payments/webhook
   └─ Includes OperationStatus = 2 (success)

6. System updates payment status
   ├─ Marks payment as "paid"
   ├─ Updates escrow holds
   └─ Sends confirmation emails
```

### Components

#### Client Libraries

**`client/lib/lacaissepay.ts`**

- `createLacaissePaySession()` — Backend call to create payment session
- `buildLacaissePayCheckoutUrl()` — Build checkout URL from sessionId/token
- `requestLacaissePayCheckoutUrl()` — Full flow: create session → build URL

#### Server Routes

**`server/routes/lacaissepay.ts`**

- `createLacaissePaySession()` — POST /api/payments/lacaissepay/session
  - Validates customer data
  - Enforces DEV phone requirement (+212611159538)
  - Calls LacaissePay API to create session
  - Returns sessionId + sessionToken
- `parseLacaissePayWebhook()` — Parse LacaissePay webhook payload

**`server/routes/payments.ts`** (existing)

- `handlePaymentsWebhook()` — Unified webhook handler
  - Accepts webhooks from any payment provider
  - Parses provider-specific formats
  - Updates payment status in database
  - Sends notifications & emails

#### Frontend Integration Points

**`client/pages/BookingDetails.tsx`** (existing booking)

- `handlePayDeposit()` — Pay remaining balance
  - Calls `requestLacaissePayCheckoutUrl()`
  - Opens checkout in new tab

**`client/components/booking/Step3Info.tsx`** (new booking)

- `handleContinue()` — Initial deposit payment
  - Calls `requestLacaissePayCheckoutUrl()`
  - Updates booking record with payment URL
  - Opens checkout in new tab

## Environment Variables

### Required (Client)

```env
# Checkout URL for redirects (set based on environment)
VITE_LACAISSEPAY_CHECKOUT_URL=https://pay.lacaissepay.ma         # PROD
# or
VITE_LACAISSEPAY_CHECKOUT_URL=https://paydev.lacaissepay.ma      # DEV
```

### Required (Server)

```env
# DEV ONLY: Phone override (must be +212611159538 for DEV testing)
LACAISSEPAY_DEV_PHONE=+212611159538

# Webhook authentication (use same as existing payments webhook)
PAYMENTS_WEBHOOK_KEY=your_webhook_secret_key
# or fallback
ADMIN_API_KEY=your_api_key

# Public base URL (for webhook callbacks)
PUBLIC_BASE_URL=https://sambooking.ma  # or https://dev.sambooking.ma
```

### Automatic (Runtime)

The server automatically selects the correct endpoint based on `NODE_ENV`:

- **Development**: `https://sessiondev.lacaissepay.ma/storePaymentData`
- **Production**: `https://pay.lacaissepay.ma/storePaymentData`

## Integration Checklist

- [ ] Add environment variables to `.env` and CI/CD
- [ ] Verify LacaissePay API credentials are valid
- [ ] Test DEV/Sandbox flow:
  - [ ] Create booking with deposit
  - [ ] Initiate payment
  - [ ] Complete payment on LacaissePay
  - [ ] Verify webhook received
  - [ ] Confirm payment status updated
- [ ] Configure webhook in LacaissePay dashboard
  - [ ] Endpoint: `{PUBLIC_BASE_URL}/api/payments/webhook`
  - [ ] Auth header: `x-webhook-key: {PAYMENTS_WEBHOOK_KEY}`
- [ ] Test PROD flow (if applicable)
- [ ] Update customer-facing docs/help text

## Key Differences from PayMa

| Aspect               | PayMa                                     | LacaissePay                                      |
| -------------------- | ----------------------------------------- | ------------------------------------------------ |
| **Session Creation** | N/A (direct redirect)                     | Required via API                                 |
| **Checkout URL**     | Simple: `https://pay.ma/{phone}/{amount}` | Complex: needs sessionId + token + Base64 config |
| **Webhook**          | Not used                                  | Required - single source of truth                |
| **DEV Phone**        | Any                                       | Must be `+212611159538`                          |
| **Payment Status**   | Updated by `accept_url` redirect          | Updated by webhook only                          |
| **Configuration**    | Minimal                                   | Detailed (customer, URLs, frontend theme)        |

## Webhook Payload

### LacaissePay Notification (to /api/payments/webhook)

```json
{
  "OperationStatus": 2,
  "ExternalId": "ORDER_ABC123",
  "OperationId": "lacaissepay_op_xyz789",
  "Amount": 999.5,
  "GatewayTrackId": "gtid_...",
  "GatewayOrderId": "goid_...",
  "GatewayReferenceId": "gref_...",
  "CreatedAt": "2024-01-21T14:30:00Z"
}
```

### Status Codes

- `OperationStatus = 2` → `payment_status = "paid"` ✅
- `OperationStatus = 3` → `payment_status = "failed"` ❌
- Others → `payment_status = "pending"`

## Troubleshooting

### Session Creation Fails

**Error**: `Failed to create payment session`

**Causes**:

1. Missing required fields (email, phone, names)
2. Invalid LacaissePay credentials
3. Network connectivity issue
4. LacaissePay API down

**Solutions**:

- Verify all customer fields are populated
- Check `VITE_LACAISSEPAY_CHECKOUT_URL` is correct for environment
- Check server logs for detailed error message
- Verify network can reach LacaissePay endpoints

### Webhook Not Received

**Symptoms**: Payment shows as "paid" on LacaissePay but not in Sam'Booking

**Causes**:

1. Webhook endpoint not configured in LacaissePay dashboard
2. Webhook authentication key mismatch
3. Firewall/network issue
4. Incorrect webhook URL

**Solutions**:

- Verify webhook endpoint in LacaissePay dashboard: `{PUBLIC_BASE_URL}/api/payments/webhook`
- Verify `PAYMENTS_WEBHOOK_KEY` matches LacaissePay configuration
- Check server logs for webhook requests
- Test webhook manually via curl/Postman

### DEV Testing Issues

**Problem**: "Phone must be +212611159538"

**Solution**: Ensure:

1. `NODE_ENV=development` on server
2. `LACAISSEPAY_DEV_PHONE=+212611159538` in `.env`
3. Customer phone input accepts this value

## Security Notes

1. **Webhook Validation**: Always verify webhook key before processing
2. **No Direct Status Update**: Never trust `accept_url` redirect alone
3. **Server-Side Only**: Session creation must be server-side (requires credentials)
4. **HTTPS Required**: All API calls must use HTTPS
5. **PII Handling**: Customer data in session creation should be logged carefully

## References

- [LacaissePay Documentation](https://api-legacy.lacaisse.ma/documentationlacaissepay.php)
- [Payment Webhook Handler](./server/routes/payments.ts)
- [LacaissePay Integration](./server/routes/lacaissepay.ts)
- [Client Integration](./client/lib/lacaissepay.ts)
