# LacaissePay Environment Variables

Add the following variables to your `.env` file for LacaissePay integration:

## Production Configuration

```env
# LacaissePay Checkout URL (Production)
VITE_LACAISSEPAY_CHECKOUT_URL=https://pay.lacaissepay.ma

# LacaissePay Session Creation Endpoint (Production)
# This is used server-side and determined automatically based on NODE_ENV
# No need to set this unless you want to override the default
LACAISSEPAY_SESSION_URL=https://pay.lacaissepay.ma/storePaymentData
```

## Development/Sandbox Configuration

```env
# LacaissePay Checkout URL (DEV/Sandbox)
VITE_LACAISSEPAY_CHECKOUT_URL=https://paydev.lacaissepay.ma

# LacaissePay Session Creation Endpoint (DEV/Sandbox)
# This is used server-side and determined automatically based on NODE_ENV
# No need to set this unless you want to override the default
LACAISSEPAY_SESSION_URL=https://sessiondev.lacaissepay.ma/storePaymentData

# DEV ONLY: Phone number override for testing (must be +212611159538 for DEV)
LACAISSEPAY_DEV_PHONE=+212611159538
```

## Webhook Configuration

The LacaissePay webhook sends notifications to:

```
POST {PUBLIC_BASE_URL}/api/payments/webhook
```

The webhook must include the `x-webhook-key` header with value matching `PAYMENTS_WEBHOOK_KEY` (or `ADMIN_API_KEY` as fallback).

LacaissePay webhook payload example:

```json
{
  "OperationStatus": 2,
  "ExternalId": "ORDER_ABC123",
  "OperationId": "lacaissepay_op_xyz789",
  "Amount": 999.5,
  "GatewayTrackId": "...",
  "GatewayOrderId": "...",
  "GatewayReferenceId": "...",
  "CreatedAt": "2024-01-21T14:30:00Z"
}
```

## Implementation Notes

1. **Session Creation**: Backend creates a session via LacaissePay API (`storePaymentData` endpoint)
2. **Redirect**: Client redirects to checkout URL with sessionId, sessionToken, and config (Base64 encoded)
3. **Payment**: User completes payment on LacaissePay checkout page
4. **Notification**: LacaissePay calls our webhook with payment result (OperationStatus = 2 for success)
5. **Confirmation**: System updates payment status based on webhook (do NOT trust accept_url redirection alone)

## Testing Checklist

- [ ] Set `NODE_ENV=development` to use DEV endpoints
- [ ] Set `LACAISSEPAY_DEV_PHONE=+212611159538` for DEV testing
- [ ] Set `VITE_LACAISSEPAY_CHECKOUT_URL=https://paydev.lacaissepay.ma`
- [ ] Verify webhook endpoint is accessible: `{PUBLIC_BASE_URL}/api/payments/webhook`
- [ ] Test payment creation flow: Booking → Deposit Payment → LacaissePay Checkout
- [ ] Verify webhook receives notification and updates payment status to "paid"

## Important Security Notes

- The session creation request includes customer details - use HTTPS
- Webhook must validate the webhook key before processing
- Never mark payment as "paid" based on `accept_url` redirect alone
- The webhook notification is the **single source of truth** for payment status
- Store `OperationId` for transaction tracking and refunds
