-- ============================================================================
-- BATCH 3: Migrations 20260211_*
-- 6 fichiers: claim_requests, reviews v2, review emails, review indexes, reservation v2, security RLS
-- ============================================================================


-- ============================================================
-- FILE: 20260211_claim_requests_status_approved.sql
-- ============================================================

-- Migration: Update claim_requests CHECK constraint to accept 'approved' status
-- The original migration only allowed: pending, contacted, verified, rejected, completed
-- The admin UI uses 'approved' instead of 'verified', so we need to add it

-- Drop the old CHECK constraint and add the updated one
ALTER TABLE claim_requests DROP CONSTRAINT IF EXISTS claim_requests_status_check;

ALTER TABLE claim_requests ADD CONSTRAINT claim_requests_status_check
  CHECK (status IN ('pending', 'contacted', 'verified', 'approved', 'rejected', 'completed'));

-- Update any existing 'verified' statuses to 'approved' for consistency
UPDATE claim_requests SET status = 'approved' WHERE status = 'verified';


-- ============================================================
-- FILE: 20260211_reviews_system_v2.sql
-- ============================================================

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

CREATE TABLE IF NOT EXISTS public.reviews (
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
CREATE INDEX IF NOT EXISTS idx_reviews_establishment_status ON public.reviews(establishment_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_establishment_published ON public.reviews(establishment_id, published_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_reviews_user ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_pending_moderation ON public.reviews(created_at ASC)
  WHERE status = 'pending_moderation';
CREATE INDEX IF NOT EXISTS idx_reviews_pending_gesture ON public.reviews(gesture_deadline ASC)
  WHERE status = 'pending_commercial_gesture';
CREATE INDEX IF NOT EXISTS idx_reviews_client_gesture ON public.reviews(client_gesture_deadline ASC)
  WHERE commercial_gesture_status = 'proposed';
CREATE INDEX IF NOT EXISTS idx_reviews_rating_overall ON public.reviews(rating_overall);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

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

CREATE TABLE IF NOT EXISTS public.review_invitations (
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
CREATE INDEX IF NOT EXISTS idx_review_invitations_token ON public.review_invitations(token);
CREATE INDEX IF NOT EXISTS idx_review_invitations_pending_send ON public.review_invitations(eligible_at ASC)
  WHERE status = 'pending' AND sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_review_invitations_pending_reminder3 ON public.review_invitations(sent_at)
  WHERE status = 'sent' AND reminder_3d_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_review_invitations_pending_reminder7 ON public.review_invitations(sent_at)
  WHERE status IN ('sent', 'reminder_3d') AND reminder_7d_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_review_invitations_expiring ON public.review_invitations(expires_at ASC)
  WHERE status NOT IN ('completed', 'expired');
CREATE INDEX IF NOT EXISTS idx_review_invitations_user ON public.review_invitations(user_id);

COMMENT ON TABLE public.review_invitations IS 'Review invitation links with H+8 trigger and J+3, J+7 reminders';
COMMENT ON COLUMN public.review_invitations.eligible_at IS 'Reservation time + 8 hours — when the invitation becomes sendable';
COMMENT ON COLUMN public.review_invitations.expires_at IS '14 days after eligible_at — review link expires';

-- =============================================================================
-- 4. TABLE: review_responses
-- Pro public responses (moderated separately)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.review_responses (
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
CREATE INDEX IF NOT EXISTS idx_review_responses_review ON public.review_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_review_responses_pending ON public.review_responses(created_at ASC)
  WHERE status = 'pending_moderation';
CREATE INDEX IF NOT EXISTS idx_review_responses_establishment ON public.review_responses(establishment_id);

COMMENT ON TABLE public.review_responses IS 'Pro public responses to reviews — moderated separately before publication';

-- =============================================================================
-- 5. TABLE: review_votes
-- Usefulness votes (useful / not_useful)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.review_votes (
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
CREATE INDEX IF NOT EXISTS idx_review_votes_review ON public.review_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_votes_user ON public.review_votes(user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.review_votes IS 'Usefulness votes on published reviews (useful/not_useful)';
COMMENT ON COLUMN public.review_votes.fingerprint IS 'Browser fingerprint for non-connected visitors (cookie-based)';

-- =============================================================================
-- 6. TABLE: review_reports
-- Flagging inappropriate reviews
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.review_reports (
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
CREATE INDEX IF NOT EXISTS idx_review_reports_pending ON public.review_reports(created_at ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_review_reports_review ON public.review_reports(review_id);

COMMENT ON TABLE public.review_reports IS 'Reports/flags on inappropriate reviews';

-- =============================================================================
-- 7. TABLE: commercial_gestures
-- Full workflow for commercial gesture (pro → client)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commercial_gestures (
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
CREATE INDEX IF NOT EXISTS idx_commercial_gestures_review ON public.commercial_gestures(review_id);
CREATE INDEX IF NOT EXISTS idx_commercial_gestures_establishment ON public.commercial_gestures(establishment_id);
CREATE INDEX IF NOT EXISTS idx_commercial_gestures_pending ON public.commercial_gestures(proposed_at)
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

DROP TRIGGER IF EXISTS trigger_reviews_updated_at ON public.reviews;
CREATE TRIGGER trigger_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_review_votes_updated_at ON public.review_votes;
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

COMMENT ON FUNCTION check_gesture_limit(UUID, TEXT) IS 'Returns TRUE if the establishment can still propose a gesture to this client (max 2 per quarter)';

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

DROP POLICY IF EXISTS reviews_select_published ON public.reviews;
CREATE POLICY reviews_select_published ON public.reviews
  FOR SELECT USING (
    status = 'published'
    OR user_id = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS reviews_insert_own ON public.reviews;
CREATE POLICY reviews_insert_own ON public.reviews
  FOR INSERT WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
  );

-- Review invitations
ALTER TABLE public.review_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_invitations_select_own ON public.review_invitations;
CREATE POLICY review_invitations_select_own ON public.review_invitations
  FOR SELECT USING (
    user_id = current_setting('app.current_user_id', true)
  );

-- Review responses
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_responses_select_published ON public.review_responses;
CREATE POLICY review_responses_select_published ON public.review_responses
  FOR SELECT USING (status = 'approved');

-- Review votes
ALTER TABLE public.review_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_votes_select_all ON public.review_votes;
CREATE POLICY review_votes_select_all ON public.review_votes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS review_votes_insert_own ON public.review_votes;
CREATE POLICY review_votes_insert_own ON public.review_votes
  FOR INSERT WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
    OR user_id IS NULL
  );

DROP POLICY IF EXISTS review_votes_update_own ON public.review_votes;
CREATE POLICY review_votes_update_own ON public.review_votes
  FOR UPDATE USING (
    user_id = current_setting('app.current_user_id', true)
    OR (user_id IS NULL AND fingerprint IS NOT NULL)
  );

-- Review reports
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_reports_insert_any ON public.review_reports;
CREATE POLICY review_reports_insert_any ON public.review_reports
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS review_reports_select_own ON public.review_reports;
CREATE POLICY review_reports_select_own ON public.review_reports
  FOR SELECT USING (
    reporter_id = current_setting('app.current_user_id', true)
  );

-- Commercial gestures
ALTER TABLE public.commercial_gestures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_gestures_select_involved ON public.commercial_gestures;
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


-- ============================================================
-- FILE: 20260211_review_email_templates.sql
-- ============================================================

-- Migration: Review system V2 email templates
-- Date: 2026-02-11
-- Description: Adds all email templates needed by the reviews system.
--   Templates: invitation, reminders, moderation feedback,
--   commercial gesture workflow, publication notifications.
--
-- All inserts are idempotent (ON CONFLICT … DO UPDATE).

-- =============================================================================
-- 1. review_invitation — Sent 8h after check-in to invite the client to review
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_invitation',
  'consumer',
  'Invitation à donner un avis',
  true,
  'Comment s''est passée votre visite chez {{establishment_name}} ?',
  'Bonjour,

Vous avez récemment visité {{establishment_name}} et nous aimerions connaître votre expérience.

Votre avis compte ! En quelques minutes, partagez votre ressenti et aidez d''autres personnes à faire leur choix.

Vous avez 14 jours pour déposer votre avis.',
  'Donner mon avis',
  '{{review_url}}',
  'How was your visit to {{establishment_name}}?',
  'Hello,

You recently visited {{establishment_name}} and we would love to hear about your experience.

Your opinion matters! In just a few minutes, share your feedback and help others make their choice.

You have 14 days to submit your review.',
  'Leave my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 2. review_reminder_3d — Sent 3 days after invitation if no review yet
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_reminder_3d',
  'consumer',
  'Rappel J+3 — Donner un avis',
  true,
  'N''oubliez pas de donner votre avis sur {{establishment_name}} 🌟',
  'Bonjour,

Il y a quelques jours, nous vous avons invité à partager votre avis sur {{establishment_name}}.

Votre retour est précieux et ne prend que quelques minutes. Chaque avis aide la communauté à découvrir les meilleures adresses.

N''attendez plus !',
  'Donner mon avis',
  '{{review_url}}',
  'Don''t forget to review {{establishment_name}} 🌟',
  'Hello,

A few days ago, we invited you to share your review of {{establishment_name}}.

Your feedback is valuable and only takes a few minutes. Every review helps the community discover the best places.

Don''t wait any longer!',
  'Leave my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 3. review_reminder_7d — Last chance reminder 7 days after invitation
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_reminder_7d',
  'consumer',
  'Dernier rappel J+7 — Donner un avis',
  true,
  'Dernière chance pour donner votre avis sur {{establishment_name}} ⏰',
  'Bonjour,

C''est votre dernière chance de partager votre avis sur {{establishment_name}}.

Votre invitation expire bientôt. Prenez 2 minutes pour partager votre expérience et aider d''autres personnes à faire le bon choix.

Merci pour votre contribution !',
  'Dernière chance pour donner mon avis',
  '{{review_url}}',
  'Last chance to review {{establishment_name}} ⏰',
  'Hello,

This is your last chance to share your review of {{establishment_name}}.

Your invitation expires soon. Take 2 minutes to share your experience and help others make the right choice.

Thank you for your contribution!',
  'Last chance to leave my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 4. review_rejected — Review rejected by moderation
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_rejected',
  'consumer',
  'Avis rejeté par la modération',
  true,
  'Votre avis sur {{establishment_name}} n''a pas pu être publié',
  'Bonjour,

Nous avons examiné votre avis sur {{establishment_name}} et malheureusement, celui-ci n''a pas pu être publié pour la raison suivante :

« {{rejection_reason}} »

Notre politique de modération vise à garantir des avis utiles, respectueux et factuels. Si vous pensez que cette décision est une erreur, vous pouvez nous contacter via le support.

Merci de votre compréhension.',
  NULL,
  NULL,
  'Your review of {{establishment_name}} could not be published',
  'Hello,

We reviewed your feedback about {{establishment_name}} and unfortunately, it could not be published for the following reason:

"{{rejection_reason}}"

Our moderation policy aims to ensure reviews are useful, respectful, and factual. If you believe this decision was made in error, you can contact our support team.

Thank you for your understanding.',
  NULL
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 5. review_modification_requested — Admin asks client to modify their review
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_modification_requested',
  'consumer',
  'Demande de modification d''avis',
  true,
  'Modification demandée pour votre avis sur {{establishment_name}}',
  'Bonjour,

Notre équipe de modération a examiné votre avis sur {{establishment_name}} et vous demande d''y apporter une modification :

« {{modification_note}} »

Cliquez sur le bouton ci-dessous pour modifier votre avis. Une fois modifié, il sera à nouveau examiné pour publication.

Merci pour votre coopération !',
  'Modifier mon avis',
  NULL,
  'Modification requested for your review of {{establishment_name}}',
  'Hello,

Our moderation team reviewed your feedback about {{establishment_name}} and is requesting a modification:

"{{modification_note}}"

Click the button below to edit your review. Once modified, it will be reviewed again for publication.

Thank you for your cooperation!',
  'Edit my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 6. review_gesture_proposed — Sent to client when pro proposes a gesture
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_gesture_proposed',
  'consumer',
  'Geste commercial proposé',
  true,
  '{{establishment_name}} vous propose un geste commercial 🎁',
  'Bonjour,

Suite à votre avis sur {{establishment_name}}, l''établissement vous propose un geste commercial :

« {{gesture_message}} »

Vous avez 48 heures pour accepter ou refuser cette proposition. Si vous acceptez, vous recevrez un code promo utilisable lors de votre prochaine visite et votre avis ne sera pas publié. Si vous refusez, votre avis sera publié normalement avec mention du geste commercial proposé.

Prenez le temps d''y réfléchir !',
  'Voir le geste commercial',
  NULL,
  '{{establishment_name}} offers you a commercial gesture 🎁',
  'Hello,

Following your review of {{establishment_name}}, the establishment is offering you a commercial gesture:

"{{gesture_message}}"

You have 48 hours to accept or refuse this offer. If you accept, you will receive a promo code for your next visit and your review will not be published. If you refuse, your review will be published normally with a mention of the proposed gesture.

Take your time to decide!',
  'View the commercial gesture'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 7. review_gesture_opportunity — Sent to pro when negative review is approved
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_gesture_opportunity',
  'pro',
  'Avis négatif — Opportunité de geste commercial',
  true,
  'Avis négatif ({{rating}}/5) pour {{establishment_name}} — Geste commercial possible',
  'Bonjour,

Un avis négatif ({{rating}}/5) a été validé par notre modération pour {{establishment_name}} :

« {{comment_preview}} »

Vous avez 24 heures pour proposer un geste commercial au client (code promo, réduction). Si vous proposez un geste et que le client l''accepte, l''avis ne sera pas publié.

Si vous ne répondez pas dans les 24h, l''avis sera automatiquement publié.

Agissez vite !',
  'Proposer un geste commercial',
  NULL,
  'Negative review ({{rating}}/5) for {{establishment_name}} — Commercial gesture possible',
  'Hello,

A negative review ({{rating}}/5) has been validated by our moderation for {{establishment_name}}:

"{{comment_preview}}"

You have 24 hours to propose a commercial gesture to the customer (promo code, discount). If you make an offer and the customer accepts, the review will not be published.

If you do not respond within 24 hours, the review will be automatically published.

Act fast!',
  'Propose a commercial gesture'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 8. review_published — Sent to client when their review is published
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_published',
  'consumer',
  'Avis publié',
  true,
  'Votre avis sur {{establishment_name}} est maintenant en ligne ✅',
  'Bonjour,

Merci pour votre retour ! Votre avis sur {{establishment_name}} a été vérifié par notre équipe de modération et est désormais publié.

Votre contribution aide d''autres personnes à découvrir les meilleures adresses. N''hésitez pas à partager vos expériences après chacune de vos visites !

Merci de faire partie de la communauté Sortir Au Maroc.',
  'Voir mon avis',
  NULL,
  'Your review of {{establishment_name}} is now live ✅',
  'Hello,

Thank you for your feedback! Your review of {{establishment_name}} has been verified by our moderation team and is now published.

Your contribution helps others discover the best places. Don''t hesitate to share your experiences after each visit!

Thank you for being part of the Sortir Au Maroc community.',
  'View my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 9. review_gesture_accepted — Confirmation email to client with promo code
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_gesture_accepted',
  'consumer',
  'Geste commercial accepté — Code promo',
  true,
  'Votre code promo chez {{establishment_name}} 🎉',
  'Bonjour,

Vous avez accepté le geste commercial de {{establishment_name}}. Voici votre code promo :

Code : {{promo_code}}
Réduction : {{discount_percent}}%

Présentez ce code lors de votre prochaine visite chez {{establishment_name}} pour en bénéficier.

Merci d''avoir donné une seconde chance à cet établissement. Nous espérons que votre prochaine expérience sera excellente !',
  'Réserver ma prochaine visite',
  NULL,
  'Your promo code at {{establishment_name}} 🎉',
  'Hello,

You accepted the commercial gesture from {{establishment_name}}. Here is your promo code:

Code: {{promo_code}}
Discount: {{discount_percent}}%

Present this code during your next visit to {{establishment_name}} to benefit from the discount.

Thank you for giving this establishment a second chance. We hope your next experience will be excellent!',
  'Book my next visit'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 10. review_gesture_expired_client — Sent to client when gesture expires
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_gesture_expired_client',
  'consumer',
  'Geste commercial expiré — Avis publié',
  true,
  'Le geste commercial de {{establishment_name}} a expiré',
  'Bonjour,

Le geste commercial proposé par {{establishment_name}} a expiré car le délai de réponse de 48 heures est dépassé.

Votre avis a été publié automatiquement avec une mention indiquant qu''un geste commercial avait été proposé.

Merci pour votre contribution à la communauté.',
  NULL,
  NULL,
  'The commercial gesture from {{establishment_name}} has expired',
  'Hello,

The commercial gesture proposed by {{establishment_name}} has expired because the 48-hour response window has passed.

Your review has been automatically published with a note indicating that a commercial gesture was proposed.

Thank you for your contribution to the community.',
  NULL
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;


-- ============================================================
-- FILE: 20260211_review_security_indexes.sql
-- ============================================================

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


-- ============================================================
-- FILE: 20260211_reservation_system_v2.sql
-- ============================================================

-- =============================================================================
-- RESERVATION SYSTEM V2 — Complete booking/reservation system upgrade
-- Date: 2026-02-11
--
-- This migration:
--   1. Extends reservations table with new statuses & fields
--   2. Extends consumer_user_stats with V2 scoring fields
--   3. Creates 8 new tables for capacity, quotas, scoring, disputes, quotes
--   4. Creates indexes, triggers, functions, RLS policies
--   5. Does NOT drop or rename any existing column/table
--
-- New tables:
--   - establishment_capacity     (capacity config per slot/day with quotas)
--   - establishment_slot_discounts (promotions per date/slot)
--   - no_show_disputes           (dispute/arbitration workflow)
--   - pro_trust_scores           (pro trust indicator)
--   - quote_requests             (group booking quotes > 15 persons)
--   - quote_messages             (messaging for quotes)
--   - pro_auto_accept_rules      (auto-acceptance rules)
--   - establishment_sanctions    (sanction history)
--
-- Depends on:
--   - public.reservations (existing)
--   - public.establishments (existing)
--   - public.consumer_users (existing)
--   - public.consumer_user_stats (existing)
--   - public.pro_slots (existing)
--   - public.consumer_promo_codes (existing)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. EXTEND: reservations — new statuses & columns
-- =============================================================================

-- 1a. Drop the old CHECK constraint on status so we can add new values
-- First find and drop any CHECK constraint on the status column
DO $$
DECLARE
  conname TEXT;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.conrelid = 'public.reservations'::regclass
    AND c.contype = 'c'
    AND a.attname = 'status'
  LIMIT 1;

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.reservations DROP CONSTRAINT %I', conname);
  END IF;
END
$$;

-- 1b. Add new CHECK constraint with all statuses (old + new)
ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN (
    -- Existing statuses (preserved)
    'requested',
    'pending_pro_validation',
    'confirmed',
    'waitlist',
    'pending_waitlist',
    'cancelled',
    'cancelled_user',
    'cancelled_pro',
    'cancelled_waitlist_expired',
    'refused',
    'noshow',
    -- New V2 statuses
    'on_hold',                  -- Pro puts reservation on hold
    'deposit_requested',        -- Pro requests deposit (future paid mode)
    'deposit_paid',             -- Client paid deposit (future paid mode)
    'expired',                  -- Pro did not respond in time
    'consumed',                 -- Confirmed presence (QR scanned or pro confirmed)
    'consumed_default',         -- Auto-validated at H+24 (no pro response)
    'no_show_confirmed',        -- No-show confirmed (client accepted or 48h expired)
    'no_show_disputed'          -- No-show contested by client, pending arbitration
  ));

-- 1c. Add new columns to reservations
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'standard'
    CHECK (type IN ('standard', 'group_quote')),
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'free'
    CHECK (payment_type IN ('free', 'paid')),
  ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES public.consumer_promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount INTEGER,              -- cents (MAD × 100)
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qr_code_token TEXT UNIQUE,           -- unique QR token for this reservation
  ADD COLUMN IF NOT EXISTS qr_scanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS protection_window_start TIMESTAMPTZ, -- reservation time - 3h
  ADD COLUMN IF NOT EXISTS pro_confirmation_requested_at TIMESTAMPTZ,  -- H+12
  ADD COLUMN IF NOT EXISTS pro_confirmation_deadline TIMESTAMPTZ,      -- H+24
  ADD COLUMN IF NOT EXISTS pro_venue_response TEXT
    CHECK (pro_venue_response IS NULL OR pro_venue_response IN ('client_came', 'client_no_show')),
  ADD COLUMN IF NOT EXISTS pro_venue_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_validated_at TIMESTAMPTZ,       -- H+24 auto-validation
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pro_custom_message TEXT,
  ADD COLUMN IF NOT EXISTS stock_type TEXT DEFAULT 'free_stock'
    CHECK (stock_type IS NULL OR stock_type IN ('paid_stock', 'free_stock', 'buffer')),
  ADD COLUMN IF NOT EXISTS converted_from_free_at TIMESTAMPTZ,  -- upgrade free → paid
  ADD COLUMN IF NOT EXISTS pro_processing_deadline TIMESTAMPTZ,  -- deadline for pro to respond
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;             -- when reservation was consumed

-- 1d. Indexes for new reservation workflows
CREATE INDEX IF NOT EXISTS idx_reservations_status_v2
  ON public.reservations(status);

CREATE INDEX IF NOT EXISTS idx_reservations_pro_processing_deadline
  ON public.reservations(pro_processing_deadline)
  WHERE status IN ('requested', 'pending_pro_validation') AND pro_processing_deadline IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_pro_confirmation_deadline
  ON public.reservations(pro_confirmation_deadline)
  WHERE pro_venue_response IS NULL AND pro_confirmation_deadline IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_protection_window
  ON public.reservations(protection_window_start)
  WHERE status = 'confirmed' AND payment_type = 'free';

CREATE INDEX IF NOT EXISTS idx_reservations_qr_token
  ON public.reservations(qr_code_token)
  WHERE qr_code_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_payment_type
  ON public.reservations(payment_type)
  WHERE payment_type = 'paid';

CREATE INDEX IF NOT EXISTS idx_reservations_stock_type
  ON public.reservations(establishment_id, stock_type, status);

COMMENT ON COLUMN public.reservations.type IS 'standard = normal booking, group_quote = quote request for 15+ people';
COMMENT ON COLUMN public.reservations.payment_type IS 'free = no deposit (beta), paid = deposit required';
COMMENT ON COLUMN public.reservations.qr_code_token IS 'Unique token for QR code validation at check-in';
COMMENT ON COLUMN public.reservations.protection_window_start IS 'starts_at - 3h: no cancellation allowed after this';
COMMENT ON COLUMN public.reservations.pro_processing_deadline IS 'Deadline for pro to accept/refuse (2h same-day, 12h otherwise)';
COMMENT ON COLUMN public.reservations.stock_type IS 'Which capacity pool this reservation uses (paid/free/buffer)';

-- =============================================================================
-- 2. EXTEND: consumer_user_stats — V2 scoring fields
-- =============================================================================

ALTER TABLE public.consumer_user_stats
  ADD COLUMN IF NOT EXISTS honored_reservations INTEGER NOT NULL DEFAULT 0
    CHECK (honored_reservations >= 0),
  ADD COLUMN IF NOT EXISTS late_cancellations INTEGER NOT NULL DEFAULT 0
    CHECK (late_cancellations >= 0),
  ADD COLUMN IF NOT EXISTS very_late_cancellations INTEGER NOT NULL DEFAULT 0
    CHECK (very_late_cancellations >= 0),
  ADD COLUMN IF NOT EXISTS reviews_posted INTEGER NOT NULL DEFAULT 0
    CHECK (reviews_posted >= 0),
  ADD COLUMN IF NOT EXISTS consecutive_honored INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_honored >= 0),
  ADD COLUMN IF NOT EXISTS consecutive_no_shows INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_no_shows >= 0),
  ADD COLUMN IF NOT EXISTS free_to_paid_conversions INTEGER NOT NULL DEFAULT 0
    CHECK (free_to_paid_conversions >= 0),
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS total_reservations INTEGER NOT NULL DEFAULT 0
    CHECK (total_reservations >= 0),
  ADD COLUMN IF NOT EXISTS scoring_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.consumer_user_stats.honored_reservations IS 'Reservations where client showed up (QR scanned or confirmed)';
COMMENT ON COLUMN public.consumer_user_stats.late_cancellations IS 'Cancellations between 12h and 24h before reservation';
COMMENT ON COLUMN public.consumer_user_stats.very_late_cancellations IS 'Cancellations less than 12h before reservation';
COMMENT ON COLUMN public.consumer_user_stats.consecutive_honored IS 'Consecutive honored reservations (for rehabilitation)';
COMMENT ON COLUMN public.consumer_user_stats.consecutive_no_shows IS 'Consecutive no-shows (for auto-suspension)';
COMMENT ON COLUMN public.consumer_user_stats.is_suspended IS 'Client is suspended from making reservations';
COMMENT ON COLUMN public.consumer_user_stats.scoring_version IS '1 = legacy V1, 2 = V2 with full scoring';

-- =============================================================================
-- 3. TABLE: establishment_capacity
-- Capacity configuration per establishment per day/slot with quotas
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- When this config applies
  day_of_week SMALLINT CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  specific_date DATE,              -- for special days (overrides day_of_week)

  -- Time slot definition
  time_slot_start TIME NOT NULL,
  time_slot_end TIME NOT NULL,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (slot_interval_minutes IN (15, 30, 60, 90, 120)),

  -- Capacity
  total_capacity INTEGER NOT NULL CHECK (total_capacity > 0),
  occupation_duration_minutes INTEGER NOT NULL DEFAULT 90
    CHECK (occupation_duration_minutes > 0 AND occupation_duration_minutes <= 480),

  -- Quota percentages (must sum to 100)
  paid_stock_percentage INTEGER NOT NULL DEFAULT 88
    CHECK (paid_stock_percentage >= 0 AND paid_stock_percentage <= 100),
  free_stock_percentage INTEGER NOT NULL DEFAULT 6
    CHECK (free_stock_percentage >= 0 AND free_stock_percentage <= 100),
  buffer_percentage INTEGER NOT NULL DEFAULT 6
    CHECK (buffer_percentage >= 0 AND buffer_percentage <= 100),

  -- Control
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT establishment_capacity_quotas_sum
    CHECK (paid_stock_percentage + free_stock_percentage + buffer_percentage = 100),
  CONSTRAINT establishment_capacity_time_range
    CHECK (time_slot_start < time_slot_end)
);

-- Unique: one config per establishment per day_of_week per time slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_establishment_capacity_dow
  ON public.establishment_capacity(establishment_id, day_of_week, time_slot_start)
  WHERE day_of_week IS NOT NULL AND specific_date IS NULL;

-- Unique: one config per establishment per specific_date per time slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_establishment_capacity_date
  ON public.establishment_capacity(establishment_id, specific_date, time_slot_start)
  WHERE specific_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_establishment_capacity_establishment
  ON public.establishment_capacity(establishment_id);

COMMENT ON TABLE public.establishment_capacity IS 'Capacity configuration per establishment, per day/slot, with paid/free/buffer quotas';
COMMENT ON COLUMN public.establishment_capacity.occupation_duration_minutes IS 'Average time a party occupies a table/space (e.g. 90 min for restaurant)';
COMMENT ON COLUMN public.establishment_capacity.paid_stock_percentage IS 'Percentage of capacity reserved for paid bookings (guaranteed)';
COMMENT ON COLUMN public.establishment_capacity.free_stock_percentage IS 'Percentage of capacity reserved for free bookings';
COMMENT ON COLUMN public.establishment_capacity.buffer_percentage IS 'Dynamic buffer pool redistributed based on demand priority rules';

-- =============================================================================
-- 4. TABLE: establishment_slot_discounts
-- Promotions/remises per date or time slot
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_slot_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Scope
  applies_to TEXT NOT NULL CHECK (applies_to IN ('specific_date', 'day_of_week', 'time_range')),
  day_of_week SMALLINT CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  specific_date DATE,
  time_slot_start TIME,
  time_slot_end TIME,

  -- Discount
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),

  -- Display
  label TEXT NOT NULL,              -- e.g. "Happy Hour", "-20%", "Meilleur tarif"

  -- Validity
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  start_date DATE,
  end_date DATE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT establishment_slot_discounts_date_range
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_establishment_slot_discounts_est
  ON public.establishment_slot_discounts(establishment_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_establishment_slot_discounts_date
  ON public.establishment_slot_discounts(specific_date)
  WHERE is_active = TRUE AND specific_date IS NOT NULL;

COMMENT ON TABLE public.establishment_slot_discounts IS 'Promotions/remises configured by pro per date, day of week, or time range';

-- =============================================================================
-- 5. TABLE: no_show_disputes
-- No-show dispute & arbitration workflow
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.no_show_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Declaration
  declared_by TEXT NOT NULL CHECK (declared_by IN ('pro', 'system')),
  declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Client notification & response
  client_notified_at TIMESTAMPTZ,
  client_response TEXT CHECK (client_response IS NULL OR client_response IN ('confirms_absence', 'disputes')),
  client_responded_at TIMESTAMPTZ,
  client_response_deadline TIMESTAMPTZ NOT NULL,  -- 48h after notification

  -- Dispute status workflow
  dispute_status TEXT NOT NULL DEFAULT 'pending_client_response'
    CHECK (dispute_status IN (
      'pending_client_response',
      'no_show_confirmed',
      'disputed_pending_arbitration',
      'resolved_favor_client',
      'resolved_favor_pro',
      'resolved_indeterminate'
    )),

  -- Arbitration
  arbitrated_by TEXT,               -- admin user_id
  arbitrated_at TIMESTAMPTZ,
  arbitration_notes TEXT,

  -- Evidence
  evidence_client JSONB DEFAULT '[]',  -- [{url, type, description}]
  evidence_pro JSONB DEFAULT '[]',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One dispute per reservation
  CONSTRAINT no_show_disputes_unique_reservation UNIQUE (reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_no_show_disputes_pending
  ON public.no_show_disputes(client_response_deadline)
  WHERE dispute_status = 'pending_client_response';

CREATE INDEX IF NOT EXISTS idx_no_show_disputes_arbitration
  ON public.no_show_disputes(created_at DESC)
  WHERE dispute_status = 'disputed_pending_arbitration';

CREATE INDEX IF NOT EXISTS idx_no_show_disputes_user
  ON public.no_show_disputes(user_id);

CREATE INDEX IF NOT EXISTS idx_no_show_disputes_establishment
  ON public.no_show_disputes(establishment_id);

COMMENT ON TABLE public.no_show_disputes IS 'No-show dispute workflow with client response window and admin arbitration';
COMMENT ON COLUMN public.no_show_disputes.client_response_deadline IS '48h after client_notified_at for client to respond';

-- =============================================================================
-- 6. TABLE: pro_trust_scores
-- Aggregated trust indicator per establishment
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Core metrics
  trust_score INTEGER NOT NULL DEFAULT 80 CHECK (trust_score BETWEEN 0 AND 100),
  response_rate NUMERIC(5,2) DEFAULT 100.0,     -- % of reservations handled in time
  avg_response_time_minutes INTEGER DEFAULT 0,

  -- Incident counters
  false_no_show_count INTEGER NOT NULL DEFAULT 0 CHECK (false_no_show_count >= 0),
  total_disputes INTEGER NOT NULL DEFAULT 0 CHECK (total_disputes >= 0),
  cancellation_rate NUMERIC(5,2) DEFAULT 0.0,    -- % of confirmed reservations cancelled by pro

  -- Sanctions
  sanctions_count INTEGER NOT NULL DEFAULT 0 CHECK (sanctions_count >= 0),
  current_sanction TEXT NOT NULL DEFAULT 'none'
    CHECK (current_sanction IN ('none', 'warning', 'deactivated_7d', 'deactivated_30d', 'permanently_excluded')),
  deactivated_until TIMESTAMPTZ,

  -- Timestamps
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One score per establishment
  CONSTRAINT pro_trust_scores_unique_establishment UNIQUE (establishment_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_trust_scores_sanction
  ON public.pro_trust_scores(current_sanction)
  WHERE current_sanction != 'none';

CREATE INDEX IF NOT EXISTS idx_pro_trust_scores_deactivated
  ON public.pro_trust_scores(deactivated_until)
  WHERE deactivated_until IS NOT NULL;

COMMENT ON TABLE public.pro_trust_scores IS 'Aggregated trust indicator per establishment (response rate, disputes, sanctions)';

-- =============================================================================
-- 7. TABLE: quote_requests
-- Group booking quotes (> 15 persons)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Event details
  party_size INTEGER NOT NULL CHECK (party_size > 15),
  preferred_date DATE,
  preferred_time_slot TIME,
  is_date_flexible BOOLEAN NOT NULL DEFAULT FALSE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'birthday', 'wedding', 'seminar', 'team_building', 'business_meal', 'other'
  )),
  event_type_other TEXT,              -- if event_type = 'other'
  requirements TEXT,                   -- special requirements (free text)
  budget_indication TEXT,

  -- Contact
  contact_phone TEXT,
  contact_email TEXT,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'acknowledged', 'quote_sent', 'quote_accepted', 'quote_declined', 'expired')),
  acknowledged_at TIMESTAMPTZ,         -- pro acknowledged receipt
  acknowledge_deadline TIMESTAMPTZ,    -- 48h after submission
  quote_deadline TIMESTAMPTZ,          -- 7 days after acknowledgement

  -- Conversion
  converted_to_reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_establishment
  ON public.quote_requests(establishment_id, status);

CREATE INDEX IF NOT EXISTS idx_quote_requests_user
  ON public.quote_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_quote_requests_pending_ack
  ON public.quote_requests(acknowledge_deadline)
  WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_quote_requests_pending_quote
  ON public.quote_requests(quote_deadline)
  WHERE status = 'acknowledged';

COMMENT ON TABLE public.quote_requests IS 'Group booking quote requests for parties > 15 people';

-- =============================================================================
-- 8. TABLE: quote_messages
-- Messaging thread for quote negotiations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,

  -- Sender
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'pro')),
  sender_id TEXT NOT NULL,

  -- Content
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  attachments JSONB DEFAULT '[]',     -- [{url, filename, type, size}]

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_messages_request
  ON public.quote_messages(quote_request_id, created_at);

COMMENT ON TABLE public.quote_messages IS 'Messaging thread between client and pro for quote negotiations';

-- =============================================================================
-- 9. TABLE: pro_auto_accept_rules
-- Auto-acceptance configuration per establishment
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_auto_accept_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Global toggle
  is_global BOOLEAN NOT NULL DEFAULT FALSE,   -- if true, accepts everything matching criteria

  -- Conditional rules
  min_client_score INTEGER CHECK (min_client_score IS NULL OR min_client_score BETWEEN 0 AND 100),
  max_party_size INTEGER CHECK (max_party_size IS NULL OR max_party_size > 0),
  applicable_time_slots JSONB,        -- [{"start": "12:00", "end": "14:00"}, ...] or null = all
  applicable_days JSONB,              -- [0,1,2,3,4,5,6] or null = all

  -- Future paid mode: auto-request deposit below this score
  auto_request_deposit_below_score INTEGER
    CHECK (auto_request_deposit_below_score IS NULL OR auto_request_deposit_below_score BETWEEN 0 AND 100),

  -- Control
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pro_auto_accept_rules_est
  ON public.pro_auto_accept_rules(establishment_id)
  WHERE is_active = TRUE;

COMMENT ON TABLE public.pro_auto_accept_rules IS 'Auto-acceptance rules per establishment (global or conditional on score, party size, time)';

-- =============================================================================
-- 10. TABLE: establishment_sanctions
-- Sanction history for establishments (pro)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_sanctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Sanction type
  type TEXT NOT NULL CHECK (type IN ('warning', 'deactivation_7d', 'deactivation_30d', 'permanent_exclusion')),
  reason TEXT NOT NULL,

  -- Related dispute
  related_dispute_id UUID REFERENCES public.no_show_disputes(id) ON DELETE SET NULL,

  -- Imposed by admin
  imposed_by TEXT NOT NULL,           -- admin user_id
  imposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Lifted (if applicable)
  lifted_by TEXT,                     -- admin user_id
  lifted_at TIMESTAMPTZ,
  lift_reason TEXT,

  -- Deactivation period
  deactivation_start TIMESTAMPTZ,
  deactivation_end TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_establishment_sanctions_est
  ON public.establishment_sanctions(establishment_id, imposed_at DESC);

CREATE INDEX IF NOT EXISTS idx_establishment_sanctions_active
  ON public.establishment_sanctions(deactivation_end)
  WHERE lifted_at IS NULL AND deactivation_end IS NOT NULL;

COMMENT ON TABLE public.establishment_sanctions IS 'Progressive sanctions history for establishments (warning, deactivation 7d/30d, exclusion)';

-- =============================================================================
-- 11. TRIGGERS: auto-update updated_at for new tables
-- =============================================================================

-- Reuse existing trigger function (created in reviews migration)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'establishment_capacity',
      'establishment_slot_discounts',
      'no_show_disputes',
      'pro_trust_scores',
      'quote_requests',
      'pro_auto_accept_rules'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trigger_%s_updated_at ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trigger_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      tbl, tbl
    );
  END LOOP;
END
$$;

-- =============================================================================
-- 12. FUNCTIONS: Availability calculation
-- =============================================================================

-- Calculate available capacity for a given establishment, date, and time
-- Returns breakdown: total, paid_available, free_available, buffer_available, occupied
CREATE OR REPLACE FUNCTION calculate_slot_availability(
  p_establishment_id UUID,
  p_date DATE,
  p_time TIME
)
RETURNS TABLE(
  total_capacity INTEGER,
  paid_total INTEGER,
  free_total INTEGER,
  buffer_total INTEGER,
  paid_occupied INTEGER,
  free_occupied INTEGER,
  buffer_occupied INTEGER,
  paid_available INTEGER,
  free_available INTEGER,
  buffer_available INTEGER,
  occupation_rate NUMERIC(5,2)
) AS $$
DECLARE
  v_dow SMALLINT;
  v_cap RECORD;
  v_occupation_duration INTERVAL;
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
BEGIN
  v_dow := EXTRACT(DOW FROM p_date)::SMALLINT;

  -- Find capacity config: specific_date first, then day_of_week, then default (null)
  SELECT * INTO v_cap
  FROM public.establishment_capacity ec
  WHERE ec.establishment_id = p_establishment_id
    AND ec.is_closed = FALSE
    AND p_time >= ec.time_slot_start
    AND p_time < ec.time_slot_end
    AND (
      (ec.specific_date = p_date)
      OR (ec.specific_date IS NULL AND ec.day_of_week = v_dow)
      OR (ec.specific_date IS NULL AND ec.day_of_week IS NULL)
    )
  ORDER BY
    ec.specific_date IS NOT NULL DESC,  -- specific_date first
    ec.day_of_week IS NOT NULL DESC      -- then day_of_week, then default
  LIMIT 1;

  -- No config found → return zeros
  IF v_cap IS NULL THEN
    RETURN QUERY SELECT
      0::INTEGER, 0::INTEGER, 0::INTEGER, 0::INTEGER,
      0::INTEGER, 0::INTEGER, 0::INTEGER,
      0::INTEGER, 0::INTEGER, 0::INTEGER,
      0.0::NUMERIC(5,2);
    RETURN;
  END IF;

  -- Calculate occupation window
  v_occupation_duration := (v_cap.occupation_duration_minutes || ' minutes')::INTERVAL;
  v_slot_start := (p_date || ' ' || p_time)::TIMESTAMPTZ;
  v_slot_end := v_slot_start + v_occupation_duration;

  -- Calculate quota amounts
  total_capacity := v_cap.total_capacity;
  paid_total := ROUND(v_cap.total_capacity * v_cap.paid_stock_percentage / 100.0)::INTEGER;
  free_total := ROUND(v_cap.total_capacity * v_cap.free_stock_percentage / 100.0)::INTEGER;
  buffer_total := v_cap.total_capacity - paid_total - free_total;  -- remainder to avoid rounding errors

  -- Count occupied seats by stock type (overlap-based)
  SELECT
    COALESCE(SUM(CASE WHEN r.stock_type = 'paid_stock' THEN r.party_size ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN r.stock_type = 'free_stock' THEN r.party_size ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN r.stock_type = 'buffer' THEN r.party_size ELSE 0 END), 0)::INTEGER
  INTO paid_occupied, free_occupied, buffer_occupied
  FROM public.reservations r
  WHERE r.establishment_id = p_establishment_id
    AND r.status IN ('requested', 'pending_pro_validation', 'confirmed', 'deposit_paid')
    AND r.starts_at < v_slot_end
    AND (r.starts_at + v_occupation_duration) > v_slot_start;

  -- Calculate available
  paid_available := GREATEST(0, paid_total - paid_occupied);
  free_available := GREATEST(0, free_total - free_occupied);
  buffer_available := GREATEST(0, buffer_total - buffer_occupied);

  -- Occupation rate
  IF total_capacity > 0 THEN
    occupation_rate := ROUND(
      ((paid_occupied + free_occupied + buffer_occupied)::NUMERIC / total_capacity) * 100, 2
    );
  ELSE
    occupation_rate := 0.0;
  END IF;

  RETURN QUERY SELECT
    total_capacity, paid_total, free_total, buffer_total,
    paid_occupied, free_occupied, buffer_occupied,
    paid_available, free_available, buffer_available,
    occupation_rate;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_slot_availability IS 'Calculate real-time availability breakdown by stock type (paid/free/buffer) using overlap-based occupation';

-- =============================================================================
-- 13. FUNCTION: Compute client score V2
-- Scale: 0-100 (displayed as 0-5 stars = score/20)
-- =============================================================================

CREATE OR REPLACE FUNCTION compute_client_score_v2(
  p_honored INTEGER DEFAULT 0,
  p_no_shows INTEGER DEFAULT 0,
  p_late_cancellations INTEGER DEFAULT 0,       -- 12h-24h
  p_very_late_cancellations INTEGER DEFAULT 0,  -- <12h
  p_total_reservations INTEGER DEFAULT 0,
  p_reviews_posted INTEGER DEFAULT 0,
  p_free_to_paid_conversions INTEGER DEFAULT 0
)
RETURNS INTEGER AS $$
DECLARE
  v_base INTEGER := 60;  -- 3.0 stars baseline
  v_score NUMERIC;
  v_anciennete NUMERIC := 0;
BEGIN
  -- Points system (on 100 scale, mapped from 5.0 scale × 20)
  -- +1 point (5.0 scale) = +20 pts (100 scale) per honored reservation
  -- -3 points (5.0 scale) = -60 pts per no-show → too harsh, use -15 per no-show
  -- Adjusted for 100 scale:
  v_score := v_base
    + (p_honored * 5)                    -- +5 pts per honored (= +0.25 stars)
    - (p_no_shows * 15)                  -- -15 pts per no-show (= -0.75 stars)
    - (p_late_cancellations * 5)         -- -5 pts per late cancel 12-24h (= -0.25 stars)
    - (p_very_late_cancellations * 10)   -- -10 pts per very late cancel <12h (= -0.5 stars)
    + (p_reviews_posted * 1)             -- +1 pt per review (= +0.05 stars)
    + (p_free_to_paid_conversions * 2);  -- +2 pts per upgrade (= +0.1 stars)

  -- Anciennete bonus
  IF p_total_reservations >= 20 THEN
    v_anciennete := 10;  -- +0.5 stars after 20 reservations
  ELSIF p_total_reservations >= 5 THEN
    v_anciennete := 5;   -- +0.25 stars after 5 reservations
  END IF;

  v_score := v_score + v_anciennete;

  -- Clamp to [0, 100]
  RETURN GREATEST(0, LEAST(100, ROUND(v_score)::INTEGER));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION compute_client_score_v2 IS 'Compute client reliability score (0-100). Display as stars: score/20 = 0-5.0 stars. Base = 60 (3.0 stars)';

-- =============================================================================
-- 14. RLS POLICIES
-- =============================================================================

-- establishment_capacity
ALTER TABLE public.establishment_capacity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS establishment_capacity_select ON public.establishment_capacity;
CREATE POLICY establishment_capacity_select ON public.establishment_capacity
  FOR SELECT USING (true);  -- Public read (needed for booking calendar)

-- establishment_slot_discounts
ALTER TABLE public.establishment_slot_discounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS establishment_slot_discounts_select ON public.establishment_slot_discounts;
CREATE POLICY establishment_slot_discounts_select ON public.establishment_slot_discounts
  FOR SELECT USING (is_active = TRUE);

-- no_show_disputes
ALTER TABLE public.no_show_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS no_show_disputes_select_involved ON public.no_show_disputes;
CREATE POLICY no_show_disputes_select_involved ON public.no_show_disputes
  FOR SELECT USING (
    user_id = current_setting('app.current_user_id', true)
  );

-- pro_trust_scores
ALTER TABLE public.pro_trust_scores ENABLE ROW LEVEL SECURITY;
-- No public read — admin and pro only (via service role)

-- quote_requests
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_requests_select_own ON public.quote_requests;
CREATE POLICY quote_requests_select_own ON public.quote_requests
  FOR SELECT USING (
    user_id = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS quote_requests_insert_own ON public.quote_requests;
CREATE POLICY quote_requests_insert_own ON public.quote_requests
  FOR INSERT WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
  );

-- quote_messages
ALTER TABLE public.quote_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_messages_select ON public.quote_messages;
CREATE POLICY quote_messages_select ON public.quote_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.quote_requests qr
      WHERE qr.id = quote_request_id
      AND qr.user_id = current_setting('app.current_user_id', true)
    )
  );

-- pro_auto_accept_rules
ALTER TABLE public.pro_auto_accept_rules ENABLE ROW LEVEL SECURITY;
-- Pro and admin only (via service role)

-- establishment_sanctions
ALTER TABLE public.establishment_sanctions ENABLE ROW LEVEL SECURITY;
-- Admin only (via service role)

-- =============================================================================
-- 15. EXTEND: waitlist_entries — add probability estimation field
-- =============================================================================

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS estimated_probability NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS party_size INTEGER;

COMMENT ON COLUMN public.waitlist_entries.estimated_probability IS 'Estimated probability of getting a spot based on historical cancellation rate';

-- =============================================================================
-- 16. EXTEND: Update reservation state machine
-- Add new valid transitions for V2 statuses
-- =============================================================================

-- This is handled in TypeScript (shared/reservationStates.ts)
-- The DB CHECK constraint already includes all valid statuses (see step 1b)

-- =============================================================================
-- 17. CREATE: Audit logs table for V2 security
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'pro', 'client', 'system')),
  actor_id TEXT,
  target_type TEXT CHECK (target_type IN ('reservation', 'establishment', 'user', 'dispute', 'quote', 'sanction')),
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by action and time
CREATE INDEX IF NOT EXISTS idx_audit_logs_v2_action_created
  ON public.audit_logs_v2 (action, created_at DESC);

-- Index for querying by actor
CREATE INDEX IF NOT EXISTS idx_audit_logs_v2_actor
  ON public.audit_logs_v2 (actor_type, actor_id, created_at DESC);

-- Index for querying by target
CREATE INDEX IF NOT EXISTS idx_audit_logs_v2_target
  ON public.audit_logs_v2 (target_type, target_id, created_at DESC);

-- RLS: Only superadmin can read audit logs
ALTER TABLE public.audit_logs_v2 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.audit_logs_v2 IS 'Audit trail for all sensitive V2 reservation actions (security, compliance)';

COMMIT;


-- ============================================================
-- FILE: 20260211_security_enable_rls.sql
-- ============================================================

-- ============================================================================
-- Security Fix: Enable RLS + fix views + drop permissive policies + warnings
-- Detected by Supabase Security Advisor
-- Executed on 2026-02-11
--
-- Result: 40 errors → 0 errors, 72 warnings → 0 warnings
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART 1: Enable RLS on all unprotected public tables (27 tables)
-- Server uses service_role_key (bypasses RLS), so this won't break anything.
-- This blocks direct access via the anon/authenticated API keys.
-- ---------------------------------------------------------------------------

-- Advertising tables
ALTER TABLE public.ad_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_home_takeover_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_auction_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Sponsored notifications
ALTER TABLE public.sponsored_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumer_sponsored_notifications ENABLE ROW LEVEL SECURITY;

-- Contact forms
ALTER TABLE public.contact_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_form_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_form_notifications ENABLE ROW LEVEL SECURITY;

-- Search
ALTER TABLE public.search_suggestions ENABLE ROW LEVEL SECURITY;

-- Pro activity
ALTER TABLE public.pro_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_activity_daily ENABLE ROW LEVEL SECURITY;

-- Referral
ALTER TABLE public.referral_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_config_universes ENABLE ROW LEVEL SECURITY;

-- Reviews & reports
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_invitations ENABLE ROW LEVEL SECURITY;
-- SKIPPED: establishment_reports was dropped earlier in this batch (old reviews system)
-- ALTER TABLE public.establishment_reports ENABLE ROW LEVEL SECURITY;

-- Usernames
ALTER TABLE public.username_subscriptions ENABLE ROW LEVEL SECURITY;

-- Booking
ALTER TABLE public.booking_confirmation_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- PART 2: Fix Security Definer Views → Security Invoker (9 views)
-- Views now run with caller's permissions, not creator's.
-- ---------------------------------------------------------------------------

ALTER VIEW IF EXISTS public.v_pro_campaigns_with_stats SET (security_invoker = on);
ALTER VIEW IF EXISTS public.admin_consumer_totp_stats SET (security_invoker = on);
ALTER VIEW IF EXISTS public.contact_form_stats SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_consumer_notifications SET (security_invoker = on);
ALTER VIEW IF EXISTS public.referral_partners_with_stats SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_ad_moderation_queue SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_import_staging_summary SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_ad_revenue_daily SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_import_batch_progress SET (security_invoker = on);

-- ---------------------------------------------------------------------------
-- PART 3: Drop overly permissive "always true" policies (16 policies)
-- service_role bypasses RLS anyway, so these were unnecessary and dangerous.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS claim_requests_insert_policy ON public.claim_requests;
DROP POLICY IF EXISTS "Service role full access batches" ON public.establishment_import_batches;
DROP POLICY IF EXISTS "Service role full access logs" ON public.establishment_import_logs;
DROP POLICY IF EXISTS "Service role full access staging" ON public.establishment_import_staging;
DROP POLICY IF EXISTS "Public can subscribe to newsletter" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "Pro inventory categories write access" ON public.pro_inventory_categories;
DROP POLICY IF EXISTS "custom_labels_select" ON public.pro_inventory_custom_labels;
DROP POLICY IF EXISTS "custom_labels_write" ON public.pro_inventory_custom_labels;
DROP POLICY IF EXISTS "Pro inventory items read access" ON public.pro_inventory_items;
DROP POLICY IF EXISTS "Pro inventory items write access" ON public.pro_inventory_items;
DROP POLICY IF EXISTS "Pro inventory pending changes read access" ON public.pro_inventory_pending_changes;
DROP POLICY IF EXISTS "Pro inventory pending changes write access" ON public.pro_inventory_pending_changes;
DROP POLICY IF EXISTS "Pro inventory variants read access" ON public.pro_inventory_variants;
DROP POLICY IF EXISTS "Pro inventory variants write access" ON public.pro_inventory_variants;
DROP POLICY IF EXISTS "Service role full access to secrets" ON public.reservation_totp_secrets;
DROP POLICY IF EXISTS "Service role full access to logs" ON public.totp_validation_logs;

-- ---------------------------------------------------------------------------
-- PART 4: Fix warnings - Function Search Path Mutable (~67 functions)
-- Sets search_path = public on all public functions missing it.
-- Excludes extension-owned functions (pg_trgm etc.)
-- ---------------------------------------------------------------------------

DO $$ DECLARE r RECORD; BEGIN FOR r IN
  SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
LOOP
  EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.nspname, r.proname, r.args);
END LOOP; END $$;

-- ---------------------------------------------------------------------------
-- PART 5: Move pg_trgm extension from public to extensions schema
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- PART 6: Drop remaining "always true" policies (4 more)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Service role full access on admin_activity_heartbeats" ON public.admin_activity_heartbeats;
DROP POLICY IF EXISTS "admin_neighborhoods_service_all" ON public.admin_neighborhoods;
DROP POLICY IF EXISTS "bug_reports_insert_policy" ON public.bug_reports;
DROP POLICY IF EXISTS "Pro can create pending changes" ON public.pro_inventory_pending_changes;

-- ---------------------------------------------------------------------------
-- PART 7: Revoke API access to materialized view
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.loyalty_program_stats FROM anon, authenticated;

