-- =============================================================================
-- REVIEWS SYSTEM V2 — Complete refactoring
-- Migration for the full review/rating system with commercial gestures,
-- moderation workflow, votes, reports, and review responses.
--
-- This migration:
--   1. Drops the old reviews system tables (reviews, review_invitations, establishment_reports)
--   2. Creates all new tables with the complete workflow
--   3. Keeps establishments.avg_rating, review_count, reviews_last_30d (from 20260128)
--   4. Creates all indexes, constraints, triggers, RLS policies, and helper functions
--
-- Tables created:
--   - reviews                (customer reviews with per-criteria ratings)
--   - review_invitations     (invitation links with H+8 / J+3 / J+7 reminders)
--   - review_responses       (pro public responses, moderated separately)
--   - review_votes           (useful / not_useful votes)
--   - review_reports         (flagging inappropriate reviews)
--   - commercial_gestures    (full commercial gesture workflow)
--
-- Depends on:
--   - public.establishments (id, universe)
--   - public.reservations (id, checked_in_at)
--   - public.consumer_promo_codes (id)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. DROP OLD TABLES (cascade drops dependent objects like triggers, policies)
-- =============================================================================

DROP TABLE IF EXISTS public.review_invitations CASCADE;
DROP TABLE IF EXISTS public.establishment_reports CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;

-- Drop old functions that will be recreated
DROP FUNCTION IF EXISTS update_establishment_rating_stats(UUID) CASCADE;

-- =============================================================================
-- 2. TABLE: reviews
-- Customer reviews with individual rating criteria per establishment category
-- =============================================================================

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Individual rating criteria (1-5 scale, nullable = not applicable to category)
  -- Restaurant/Hotel/Wellness: welcome, quality, value, ambiance, hygiene
  -- Loisir/Evenement: welcome, quality, value, ambiance, organization
  rating_welcome SMALLINT NOT NULL CHECK (rating_welcome BETWEEN 1 AND 5),
  rating_quality SMALLINT NOT NULL CHECK (rating_quality BETWEEN 1 AND 5),
  rating_value SMALLINT NOT NULL CHECK (rating_value BETWEEN 1 AND 5),
  rating_ambiance SMALLINT NOT NULL CHECK (rating_ambiance BETWEEN 1 AND 5),
  rating_hygiene SMALLINT CHECK (rating_hygiene IS NULL OR rating_hygiene BETWEEN 1 AND 5),
  rating_organization SMALLINT CHECK (rating_organization IS NULL OR rating_organization BETWEEN 1 AND 5),

  -- Computed overall rating (average of applicable criteria)
  rating_overall NUMERIC(2,1) NOT NULL CHECK (rating_overall >= 1.0 AND rating_overall <= 5.0),

  -- Content
  comment TEXT NOT NULL CHECK (char_length(comment) BETWEEN 50 AND 1500),
  would_recommend BOOLEAN,  -- optional "Would you recommend?" question
  photos TEXT[] DEFAULT '{}',  -- array of storage URLs, max 3

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'pending_moderation'
    CHECK (status IN (
      'pending_moderation',           -- Waiting for admin review
      'approved',                     -- Admin approved (note >= 4 → published immediately)
      'rejected',                     -- Admin rejected (with reason)
      'modification_requested',       -- Admin requests changes from client
      'pending_commercial_gesture',   -- Note < 4, approved, waiting for pro (24h)
      'resolved',                     -- Client accepted gesture → not published
      'published'                     -- Visible to public
    )),

  -- Moderation
  moderated_by TEXT,           -- admin user id
  moderated_at TIMESTAMPTZ,
  moderation_note TEXT,        -- reason for rejection or modification request

  -- Commercial gesture tracking
  commercial_gesture_status TEXT NOT NULL DEFAULT 'none'
    CHECK (commercial_gesture_status IN (
      'none',       -- No gesture (note >= 4 or gesture not applicable)
      'proposed',   -- Pro proposed a gesture
      'accepted',   -- Client accepted → review hidden
      'refused',    -- Client refused → review published with mention
      'expired'     -- Pro or client didn't respond in time → published
    )),
  gesture_deadline TIMESTAMPTZ,          -- 24h after moderation approval (for pro to respond)
  client_gesture_deadline TIMESTAMPTZ,   -- 48h after pro proposes gesture (for client to respond)

  -- Publication
  published_at TIMESTAMPTZ,
  gesture_mention BOOLEAN NOT NULL DEFAULT FALSE,  -- true if "L'établissement a proposé un geste commercial"

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT reviews_unique_reservation UNIQUE (reservation_id),
  CONSTRAINT reviews_hygiene_or_organization CHECK (
    -- At least one of hygiene or organization must be set
    rating_hygiene IS NOT NULL OR rating_organization IS NOT NULL
  ),
  CONSTRAINT reviews_photos_max_3 CHECK (array_length(photos, 1) IS NULL OR array_length(photos, 1) <= 3)
);

-- Indexes
CREATE INDEX idx_reviews_establishment_status ON public.reviews(establishment_id, status);
CREATE INDEX idx_reviews_establishment_published ON public.reviews(establishment_id, published_at DESC)
  WHERE status = 'published';
CREATE INDEX idx_reviews_user ON public.reviews(user_id);
CREATE INDEX idx_reviews_pending_moderation ON public.reviews(created_at ASC)
  WHERE status = 'pending_moderation';
CREATE INDEX idx_reviews_pending_gesture ON public.reviews(gesture_deadline ASC)
  WHERE status = 'pending_commercial_gesture';
CREATE INDEX idx_reviews_client_gesture ON public.reviews(client_gesture_deadline ASC)
  WHERE commercial_gesture_status = 'proposed';
CREATE INDEX idx_reviews_rating_overall ON public.reviews(rating_overall);
CREATE INDEX idx_reviews_created_at ON public.reviews(created_at DESC);

COMMENT ON TABLE public.reviews IS 'Customer reviews with per-criteria ratings and full moderation/gesture workflow';
COMMENT ON COLUMN public.reviews.rating_hygiene IS 'Hygiene rating — applicable to restaurant, hotel, wellness categories';
COMMENT ON COLUMN public.reviews.rating_organization IS 'Organization rating — applicable to loisir, evenement categories';
COMMENT ON COLUMN public.reviews.rating_overall IS 'Computed average of applicable criteria ratings';
COMMENT ON COLUMN public.reviews.gesture_deadline IS '24h after moderation approval for pro to propose gesture (note < 4)';
COMMENT ON COLUMN public.reviews.client_gesture_deadline IS '48h after pro proposes gesture for client to accept/refuse';

-- =============================================================================
-- 3. TABLE: review_invitations
-- Invitation links sent H+8, with J+3 and J+7 reminders
-- =============================================================================

CREATE TABLE public.review_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Secure token for invitation link
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'reminder_3d', 'reminder_7d', 'clicked', 'completed', 'expired')),

  -- Timing
  eligible_at TIMESTAMPTZ NOT NULL,    -- reservation time + 8 hours
  sent_at TIMESTAMPTZ,                 -- when first email sent
  reminder_3d_sent_at TIMESTAMPTZ,     -- J+3 reminder sent
  reminder_7d_sent_at TIMESTAMPTZ,     -- J+7 reminder sent
  expires_at TIMESTAMPTZ NOT NULL,     -- 14 days after eligible_at
  clicked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Link to resulting review
  review_id UUID REFERENCES public.reviews(id) ON DELETE SET NULL,

  -- Email retry tracking
  last_email_attempt_at TIMESTAMPTZ,
  email_attempts INT NOT NULL DEFAULT 0,
  last_email_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One invitation per reservation
  CONSTRAINT review_invitations_unique_reservation UNIQUE (reservation_id)
);

-- Indexes
CREATE INDEX idx_review_invitations_token ON public.review_invitations(token);
CREATE INDEX idx_review_invitations_pending_send ON public.review_invitations(eligible_at ASC)
  WHERE status = 'pending' AND sent_at IS NULL;
CREATE INDEX idx_review_invitations_pending_reminder3 ON public.review_invitations(sent_at)
  WHERE status = 'sent' AND reminder_3d_sent_at IS NULL;
CREATE INDEX idx_review_invitations_pending_reminder7 ON public.review_invitations(sent_at)
  WHERE status IN ('sent', 'reminder_3d') AND reminder_7d_sent_at IS NULL;
CREATE INDEX idx_review_invitations_expiring ON public.review_invitations(expires_at ASC)
  WHERE status NOT IN ('completed', 'expired');
CREATE INDEX idx_review_invitations_user ON public.review_invitations(user_id);

COMMENT ON TABLE public.review_invitations IS 'Review invitation links with H+8 trigger and J+3, J+7 reminders';
COMMENT ON COLUMN public.review_invitations.eligible_at IS 'Reservation time + 8 hours — when the invitation becomes sendable';
COMMENT ON COLUMN public.review_invitations.expires_at IS '14 days after eligible_at — review link expires';

-- =============================================================================
-- 4. TABLE: review_responses
-- Pro public responses (moderated separately)
-- =============================================================================

CREATE TABLE public.review_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Content
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 10 AND 1500),

  -- Moderation
  status TEXT NOT NULL DEFAULT 'pending_moderation'
    CHECK (status IN ('pending_moderation', 'approved', 'rejected')),
  moderated_by TEXT,
  moderated_at TIMESTAMPTZ,
  moderation_note TEXT,

  -- Publication
  published_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One response per review
  CONSTRAINT review_responses_unique_review UNIQUE (review_id)
);

-- Indexes
CREATE INDEX idx_review_responses_review ON public.review_responses(review_id);
CREATE INDEX idx_review_responses_pending ON public.review_responses(created_at ASC)
  WHERE status = 'pending_moderation';
CREATE INDEX idx_review_responses_establishment ON public.review_responses(establishment_id);

COMMENT ON TABLE public.review_responses IS 'Pro public responses to reviews — moderated separately before publication';

-- =============================================================================
-- 5. TABLE: review_votes
-- Usefulness votes (useful / not_useful)
-- =============================================================================

CREATE TABLE public.review_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id TEXT,           -- null for non-connected visitors
  fingerprint TEXT,       -- browser fingerprint for non-connected visitors

  -- Vote
  vote TEXT NOT NULL CHECK (vote IN ('useful', 'not_useful')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One vote per user/fingerprint per review
  CONSTRAINT review_votes_unique_user UNIQUE (review_id, user_id),
  CONSTRAINT review_votes_unique_fingerprint UNIQUE (review_id, fingerprint),
  -- At least one identifier required
  CONSTRAINT review_votes_has_identity CHECK (user_id IS NOT NULL OR fingerprint IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_review_votes_review ON public.review_votes(review_id);
CREATE INDEX idx_review_votes_user ON public.review_votes(user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.review_votes IS 'Usefulness votes on published reviews (useful/not_useful)';
COMMENT ON COLUMN public.review_votes.fingerprint IS 'Browser fingerprint for non-connected visitors (cookie-based)';

-- =============================================================================
-- 6. TABLE: review_reports
-- Flagging inappropriate reviews
-- =============================================================================

CREATE TABLE public.review_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  reporter_id TEXT,               -- null for visitors
  reporter_type TEXT NOT NULL DEFAULT 'visitor'
    CHECK (reporter_type IN ('user', 'pro', 'visitor')),

  -- Report details
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),

  -- Resolution
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate reports from same reporter on same review
  CONSTRAINT review_reports_unique_user UNIQUE (review_id, reporter_id)
);

-- Indexes
CREATE INDEX idx_review_reports_pending ON public.review_reports(created_at ASC)
  WHERE status = 'pending';
CREATE INDEX idx_review_reports_review ON public.review_reports(review_id);

COMMENT ON TABLE public.review_reports IS 'Reports/flags on inappropriate reviews';

-- =============================================================================
-- 7. TABLE: commercial_gestures
-- Full workflow for commercial gesture (pro → client)
-- =============================================================================

CREATE TABLE public.commercial_gestures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  promo_code_id UUID REFERENCES public.consumer_promo_codes(id) ON DELETE SET NULL,

  -- Pro message
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 1000),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'refused', 'expired')),

  -- Timing
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,   -- when client accepted or refused

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One gesture per review
  CONSTRAINT commercial_gestures_unique_review UNIQUE (review_id)
);

-- Indexes
CREATE INDEX idx_commercial_gestures_review ON public.commercial_gestures(review_id);
CREATE INDEX idx_commercial_gestures_establishment ON public.commercial_gestures(establishment_id);
CREATE INDEX idx_commercial_gestures_pending ON public.commercial_gestures(proposed_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.commercial_gestures IS 'Commercial gesture workflow: pro proposes promo code + apology to client for negative reviews';
COMMENT ON COLUMN public.commercial_gestures.promo_code_id IS 'Reference to consumer_promo_codes created for this gesture';

-- =============================================================================
-- 8. TRIGGERS: auto-update updated_at
-- =============================================================================

-- Reusable trigger function (CREATE OR REPLACE to be safe)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_review_votes_updated_at
  BEFORE UPDATE ON public.review_votes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 9. FUNCTION: Update establishment rating stats
-- Called when a review is published
-- =============================================================================

CREATE OR REPLACE FUNCTION update_establishment_rating_stats(p_establishment_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.establishments SET
    avg_rating = (
      SELECT ROUND(AVG(rating_overall)::numeric, 1)
      FROM public.reviews
      WHERE establishment_id = p_establishment_id
      AND status = 'published'
    ),
    review_count = (
      SELECT COUNT(*)
      FROM public.reviews
      WHERE establishment_id = p_establishment_id
      AND status = 'published'
    ),
    reviews_last_30d = (
      SELECT COUNT(*)
      FROM public.reviews
      WHERE establishment_id = p_establishment_id
      AND status = 'published'
      AND published_at > NOW() - INTERVAL '30 days'
    )
  WHERE id = p_establishment_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_establishment_rating_stats IS 'Updates establishment avg_rating, review_count, reviews_last_30d from published reviews';

-- =============================================================================
-- 10. FUNCTION: Compute overall rating from criteria
-- Used in application code, provided here for reference/validation
-- =============================================================================

CREATE OR REPLACE FUNCTION compute_review_overall_rating(
  p_welcome SMALLINT,
  p_quality SMALLINT,
  p_value SMALLINT,
  p_ambiance SMALLINT,
  p_hygiene SMALLINT DEFAULT NULL,
  p_organization SMALLINT DEFAULT NULL
)
RETURNS NUMERIC(2,1) AS $$
DECLARE
  total INT := 0;
  count INT := 0;
BEGIN
  -- Always included
  total := p_welcome + p_quality + p_value + p_ambiance;
  count := 4;

  -- Add hygiene if applicable
  IF p_hygiene IS NOT NULL THEN
    total := total + p_hygiene;
    count := count + 1;
  END IF;

  -- Add organization if applicable
  IF p_organization IS NOT NULL THEN
    total := total + p_organization;
    count := count + 1;
  END IF;

  RETURN ROUND((total::numeric / count), 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION compute_review_overall_rating IS 'Computes overall rating as average of applicable criteria (4 or 5 criteria depending on category)';

-- =============================================================================
-- 11. FUNCTION: Check commercial gesture anti-abuse limit
-- Max 2 gestures per quarter per establishment for same client
-- =============================================================================

CREATE OR REPLACE FUNCTION check_gesture_limit(
  p_establishment_id UUID,
  p_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  gesture_count INT;
BEGIN
  SELECT COUNT(*) INTO gesture_count
  FROM public.commercial_gestures cg
  JOIN public.reviews r ON r.id = cg.review_id
  WHERE cg.establishment_id = p_establishment_id
    AND r.user_id = p_user_id
    AND cg.status IN ('pending', 'accepted', 'refused')
    AND cg.created_at > NOW() - INTERVAL '3 months';

  RETURN gesture_count < 2;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_gesture_limit IS 'Returns TRUE if the establishment can still propose a gesture to this client (max 2 per quarter)';

-- =============================================================================
-- 12. FUNCTION: Count useful votes for a review
-- =============================================================================

CREATE OR REPLACE FUNCTION get_review_vote_counts(p_review_id UUID)
RETURNS TABLE(useful_count BIGINT, not_useful_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE vote = 'useful') AS useful_count,
    COUNT(*) FILTER (WHERE vote = 'not_useful') AS not_useful_count
  FROM public.review_votes
  WHERE review_id = p_review_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 13. VIEW: Review summary stats per establishment
-- Used by the public API for the summary endpoint
-- =============================================================================

CREATE OR REPLACE VIEW public.v_establishment_review_summary
WITH (security_invoker = true)
AS
SELECT
  r.establishment_id,
  COUNT(*) AS total_reviews,
  ROUND(AVG(r.rating_overall)::numeric, 1) AS avg_overall,
  ROUND(AVG(r.rating_welcome)::numeric, 1) AS avg_welcome,
  ROUND(AVG(r.rating_quality)::numeric, 1) AS avg_quality,
  ROUND(AVG(r.rating_value)::numeric, 1) AS avg_value,
  ROUND(AVG(r.rating_ambiance)::numeric, 1) AS avg_ambiance,
  ROUND(AVG(r.rating_hygiene)::numeric, 1) AS avg_hygiene,
  ROUND(AVG(r.rating_organization)::numeric, 1) AS avg_organization,
  -- Star distribution
  COUNT(*) FILTER (WHERE r.rating_overall >= 4.5) AS stars_5,
  COUNT(*) FILTER (WHERE r.rating_overall >= 3.5 AND r.rating_overall < 4.5) AS stars_4,
  COUNT(*) FILTER (WHERE r.rating_overall >= 2.5 AND r.rating_overall < 3.5) AS stars_3,
  COUNT(*) FILTER (WHERE r.rating_overall >= 1.5 AND r.rating_overall < 2.5) AS stars_2,
  COUNT(*) FILTER (WHERE r.rating_overall < 1.5) AS stars_1,
  -- Recommendation rate
  ROUND(
    (COUNT(*) FILTER (WHERE r.would_recommend = TRUE))::numeric /
    NULLIF(COUNT(*) FILTER (WHERE r.would_recommend IS NOT NULL), 0) * 100,
    0
  ) AS recommendation_rate,
  -- Photos count
  COUNT(*) FILTER (WHERE array_length(r.photos, 1) > 0) AS reviews_with_photos
FROM public.reviews r
WHERE r.status = 'published'
GROUP BY r.establishment_id;

COMMENT ON VIEW public.v_establishment_review_summary IS 'Aggregated review statistics per establishment (only published reviews)';

-- =============================================================================
-- 14. RLS POLICIES
-- =============================================================================

-- Reviews
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY reviews_select_published ON public.reviews
  FOR SELECT USING (
    status = 'published'
    OR user_id = current_setting('app.current_user_id', true)
  );

CREATE POLICY reviews_insert_own ON public.reviews
  FOR INSERT WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
  );

-- Review invitations
ALTER TABLE public.review_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_invitations_select_own ON public.review_invitations
  FOR SELECT USING (
    user_id = current_setting('app.current_user_id', true)
  );

-- Review responses
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_responses_select_published ON public.review_responses
  FOR SELECT USING (status = 'approved');

-- Review votes
ALTER TABLE public.review_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_votes_select_all ON public.review_votes
  FOR SELECT USING (true);

CREATE POLICY review_votes_insert_own ON public.review_votes
  FOR INSERT WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
    OR user_id IS NULL
  );

CREATE POLICY review_votes_update_own ON public.review_votes
  FOR UPDATE USING (
    user_id = current_setting('app.current_user_id', true)
    OR (user_id IS NULL AND fingerprint IS NOT NULL)
  );

-- Review reports
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_reports_insert_any ON public.review_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY review_reports_select_own ON public.review_reports
  FOR SELECT USING (
    reporter_id = current_setting('app.current_user_id', true)
  );

-- Commercial gestures
ALTER TABLE public.commercial_gestures ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_gestures_select_involved ON public.commercial_gestures
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.id = review_id
      AND (r.user_id = current_setting('app.current_user_id', true))
    )
  );

-- =============================================================================
-- 15. STORAGE BUCKET for review photos
-- =============================================================================

-- Note: This needs to be run via Supabase Dashboard or management API
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'review-photos',
--   'review-photos',
--   true,
--   5242880,  -- 5 MB
--   ARRAY['image/jpeg', 'image/png', 'image/webp']
-- )
-- ON CONFLICT (id) DO NOTHING;

COMMIT;
