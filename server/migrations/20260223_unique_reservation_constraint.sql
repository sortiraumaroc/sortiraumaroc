-- =============================================================================
-- Migration: Partial unique index to prevent double bookings
-- Date: 2026-02-23
-- Purpose: Prevent race condition (TOCTOU) where two concurrent requests
--          create duplicate reservations for the same user+establishment+slot.
--          The SELECT-then-INSERT pattern in reservationV2Logic.ts is vulnerable
--          to concurrent execution. This DB-level constraint is the safety net.
-- =============================================================================

-- Only enforce uniqueness for "active" reservation statuses.
-- Cancelled/rejected/no_show reservations should not block future bookings.
create unique index if not exists idx_reservations_no_double_booking
  on public.reservations (user_id, establishment_id, starts_at)
  where status in (
    'requested',
    'pending_pro_validation',
    'confirmed',
    'deposit_paid',
    'on_hold',
    'consumed'
  );
