-- =============================================================================
-- Migration: Pending Finance Operations retry queue
-- Date: 2026-02-23
-- Purpose: When escrow/invoice/commission operations fail in the payment
--          webhook, they are enqueued here for automatic retry.
--          Pattern follows pending_vf_documents (VosFactures retry queue).
-- =============================================================================

create table if not exists public.pending_finance_operations (
  id               uuid primary key default gen_random_uuid(),

  -- What operation to perform
  operation_type   text not null,
  -- e.g.: 'escrow_hold_reservation', 'escrow_settle_reservation',
  --       'escrow_hold_pack_purchase', 'settle_pack_purchase_refund',
  --       'invoice_reservation', 'invoice_pack_purchase',
  --       'invoice_visibility_order', 'commission_snapshot'

  -- Reference to the entity this operation belongs to
  reference_type   text not null,      -- 'reservation', 'pack_purchase', 'visibility_order'
  reference_id     text not null,      -- UUID of the entity

  -- Serialized parameters needed to replay the operation
  payload          jsonb not null default '{}',

  -- Retry state
  status           text not null default 'pending'
                   check (status in ('pending', 'processing', 'completed', 'failed')),
  retry_count      int not null default 0,
  error_message    text,

  -- Actor who triggered the original operation (for audit)
  actor_user_id    text,
  actor_role       text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Index for cron fetch: get pending operations ordered by creation time
create index if not exists idx_pending_finance_ops_status_created
  on public.pending_finance_operations (status, created_at)
  where status in ('pending', 'processing');

-- Deduplication: prevent duplicate pending operations for the same entity + operation
create unique index if not exists idx_pending_finance_ops_dedup
  on public.pending_finance_operations (operation_type, reference_type, reference_id)
  where status in ('pending', 'processing');

-- RLS: service_role only
alter table public.pending_finance_operations enable row level security;

drop policy if exists "pending_finance_ops_service_all" on public.pending_finance_operations;
create policy "pending_finance_ops_service_all"
  on public.pending_finance_operations
  for all
  to service_role
  using (true)
  with check (true);
