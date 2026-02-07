-- Adds booking_reference support to consumer promo code redemptions
-- Allows promo codes to be used for table reservations (not just pack purchases)

begin;

-- Add booking_reference column to track promo code usage on reservations
alter table public.consumer_promo_code_redemptions
  add column if not exists booking_reference text null;

-- Create index for fast lookup by booking reference
create index if not exists idx_consumer_promo_code_redemptions_booking_ref
  on public.consumer_promo_code_redemptions (booking_reference)
  where booking_reference is not null;

-- Add constraint: either pack_purchase_id or booking_reference must be set (or both null for legacy)
-- Note: We don't enforce this as a CHECK constraint to maintain backwards compatibility

commit;
