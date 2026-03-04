-- =============================================================================
-- Migration: Add missing indexes identified during audit
-- Date: 2026-02-23
-- Purpose: Improve query performance on frequently accessed columns.
--          All indexes are additive (CREATE INDEX IF NOT EXISTS) — no downtime.
-- =============================================================================

-- 1. reservations(user_id, status) — used by consumer dashboard, webhook dedup
create index if not exists idx_reservations_user_status
  on public.reservations (user_id, status);

-- 2. pro_establishment_memberships(establishment_id) — used by pro routes, webhooks
create index if not exists idx_pro_memberships_establishment
  on public.pro_establishment_memberships (establishment_id);

-- 3. ad_wallet_transactions(wallet_id) — used by wallet history, billing
create index if not exists idx_ad_wallet_tx_wallet_id
  on public.ad_wallet_transactions (wallet_id);

-- 4. packs(establishment_id, moderation_status) — used by pro packs tab, public listings
create index if not exists idx_packs_establishment_moderation
  on public.packs (establishment_id, moderation_status);
