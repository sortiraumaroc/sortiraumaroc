-- =============================================================================
-- Migration: Atomic pack stock adjustment
-- Date: 2026-02-23
-- Purpose: Fix race condition in pack stock adjustment (read-modify-write).
--          Two concurrent webhook calls for the same pack can both read stock=10,
--          then both write stock=9, losing one decrement.
--          This RPC uses atomic SQL arithmetic: stock = GREATEST(0, stock + delta).
-- =============================================================================

create or replace function public.adjust_pack_stock(
  p_pack_id uuid,
  p_delta   int
) returns int as $$
declare
  v_new_stock int;
begin
  -- Only adjust limited packs (is_limited = true, stock IS NOT NULL).
  update public.packs
  set stock      = greatest(0, coalesce(stock, 0) + p_delta),
      updated_at = now()
  where id = p_pack_id
    and is_limited = true
    and stock is not null
  returning stock into v_new_stock;

  -- If pack is not limited or not found, return -1 as sentinel.
  if not found then
    return -1;
  end if;

  return v_new_stock;
end;
$$ language plpgsql security definer;
