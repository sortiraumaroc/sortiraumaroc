-- Waitlist performance indexes
--
-- Notes:
-- - Uses CONCURRENTLY to reduce lock impact.
-- - Uses IF NOT EXISTS to be safe on repeated runs.
-- - These indexes are designed around the most frequent query patterns used by:
--   * /api/consumer/establishments/:establishmentId/waitlist (duplicate prevention)
--   * /api/consumer/waitlist (user list)
--   * /api/pro/establishments/:establishmentId/waitlist (pro list)
--   * waitlist_process_slot RPC (slot queue processing)

-- 1) Fast duplicate prevention (consumer): one active entry per user + slot
CREATE INDEX CONCURRENTLY IF NOT EXISTS waitlist_entries_user_slot_active_created_at_idx
ON public.waitlist_entries (user_id, slot_id, created_at DESC)
WHERE status IN ('waiting', 'offer_sent', 'queued');

-- 2) Fast consumer list (order by created_at desc)
CREATE INDEX CONCURRENTLY IF NOT EXISTS waitlist_entries_user_created_at_idx
ON public.waitlist_entries (user_id, created_at DESC);

-- 3) Fast promotion / slot queue processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS waitlist_entries_slot_queue_idx
ON public.waitlist_entries (slot_id, status, position, created_at)
WHERE status IN ('waiting', 'queued', 'offer_sent');

-- 4) Fast join from waitlist_entries -> reservations
CREATE INDEX CONCURRENTLY IF NOT EXISTS waitlist_entries_reservation_id_idx
ON public.waitlist_entries (reservation_id);

-- 5) Fast scan of active offers for lazy expiration / monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS waitlist_entries_offer_sent_expires_at_idx
ON public.waitlist_entries (offer_expires_at)
WHERE status = 'offer_sent';

-- 6) Capacity checks are often done by slot_id + status (confirmed/pending/requested)
-- This supports createConsumerWaitlist and waitlist_accept_offer capacity validation.
CREATE INDEX CONCURRENTLY IF NOT EXISTS reservations_slot_active_status_idx
ON public.reservations (slot_id, status)
WHERE status IN ('confirmed', 'pending_pro_validation', 'requested');
