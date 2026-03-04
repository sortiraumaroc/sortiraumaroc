-- Migration: Review system V2 — Security indexes and constraints
-- Date: 2026-02-11
-- Description: Add performance indexes for anti-fraud queries,
--   unique constraints to prevent duplicate abuse, and
--   helper functions for rate-limiting checks.

-- =============================================================================
-- 1. UNIQUE CONSTRAINT: One review per reservation (idempotent)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_reviews_unique_reservation'
  ) THEN
    CREATE UNIQUE INDEX idx_reviews_unique_reservation
    ON public.reviews (reservation_id);
  END IF;
END
$$;

-- =============================================================================
-- 2. UNIQUE CONSTRAINT: One review per user per establishment
-- (prevents multiple reviews even across different reservations)
-- Applies only to non-rejected reviews
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_reviews_unique_user_establishment'
  ) THEN
    CREATE UNIQUE INDEX idx_reviews_unique_user_establishment
    ON public.reviews (user_id, establishment_id)
    WHERE status NOT IN ('rejected');
  END IF;
END
$$;

-- =============================================================================
-- 3. INDEX: Fast lookup for cooldown check (user's most recent review)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_reviews_user_created_at'
  ) THEN
    CREATE INDEX idx_reviews_user_created_at
    ON public.reviews (user_id, created_at DESC);
  END IF;
END
$$;

-- =============================================================================
-- 4. INDEX: Fast lookup for vote dedup (user + review)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_review_votes_user_review'
  ) THEN
    CREATE UNIQUE INDEX idx_review_votes_user_review
    ON public.review_votes (user_id, review_id)
    WHERE user_id IS NOT NULL;
  END IF;
END
$$;

-- =============================================================================
-- 5. INDEX: Fast lookup for vote dedup (fingerprint + review)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_review_votes_fingerprint_review'
  ) THEN
    CREATE UNIQUE INDEX idx_review_votes_fingerprint_review
    ON public.review_votes (fingerprint, review_id)
    WHERE fingerprint IS NOT NULL;
  END IF;
END
$$;

-- =============================================================================
-- 6. INDEX: Fast lookup for report dedup (reporter + review)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_review_reports_reporter_review'
  ) THEN
    CREATE UNIQUE INDEX idx_review_reports_reporter_review
    ON public.review_reports (reporter_id, review_id)
    WHERE reporter_id IS NOT NULL;
  END IF;
END
$$;

-- =============================================================================
-- 7. INDEX: Published reviews for public queries (most common query)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_reviews_establishment_published'
  ) THEN
    CREATE INDEX idx_reviews_establishment_published
    ON public.reviews (establishment_id, published_at DESC)
    WHERE status = 'published';
  END IF;
END
$$;

-- =============================================================================
-- 8. INDEX: Pending moderation reviews (admin dashboard)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_reviews_pending_moderation'
  ) THEN
    CREATE INDEX idx_reviews_pending_moderation
    ON public.reviews (created_at DESC)
    WHERE status = 'pending_moderation';
  END IF;
END
$$;

-- =============================================================================
-- 9. INDEX: Commercial gesture deadline tracking (cron queries)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_reviews_gesture_deadline'
  ) THEN
    CREATE INDEX idx_reviews_gesture_deadline
    ON public.reviews (gesture_deadline)
    WHERE status = 'pending_commercial_gesture'
      AND commercial_gesture_status = 'none';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_reviews_client_gesture_deadline'
  ) THEN
    CREATE INDEX idx_reviews_client_gesture_deadline
    ON public.reviews (client_gesture_deadline)
    WHERE commercial_gesture_status = 'proposed';
  END IF;
END
$$;

-- =============================================================================
-- 10. INDEX: Invitation processing (cron queries)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_review_invitations_pending_eligible'
  ) THEN
    CREATE INDEX idx_review_invitations_pending_eligible
    ON public.review_invitations (eligible_at)
    WHERE status = 'pending' AND sent_at IS NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_review_invitations_sent_reminders'
  ) THEN
    CREATE INDEX idx_review_invitations_sent_reminders
    ON public.review_invitations (sent_at)
    WHERE status IN ('sent', 'reminder_3d')
      AND reminder_7d_sent_at IS NULL;
  END IF;
END
$$;

-- =============================================================================
-- 11. RPC: get_review_vote_counts (used by public review list)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_review_vote_counts(p_review_id uuid)
RETURNS TABLE(useful_count bigint, not_useful_count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN vote = 'useful' THEN 1 ELSE 0 END), 0) AS useful_count,
    COALESCE(SUM(CASE WHEN vote = 'not_useful' THEN 1 ELSE 0 END), 0) AS not_useful_count
  FROM public.review_votes
  WHERE review_id = p_review_id;
$$;

-- =============================================================================
-- 12. RPC: check_gesture_limit (max 2 per quarter per establishment per user)
-- =============================================================================

CREATE OR REPLACE FUNCTION check_gesture_limit(
  p_establishment_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT (
    SELECT COUNT(*)
    FROM public.commercial_gestures cg
    INNER JOIN public.reviews r ON r.id = cg.review_id
    WHERE cg.establishment_id = p_establishment_id
      AND r.user_id = p_user_id
      AND cg.created_at >= (NOW() - INTERVAL '3 months')
  ) < 2;
$$;
