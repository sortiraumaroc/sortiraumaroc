-- ============================================================================
-- BATCH 2: Migrations 20260209-20260210_*
-- 6 fichiers: bug reports, highlights, wizard columns, admin activity, email templates, search
-- ============================================================================


-- ============================================================
-- FILE: 20260209_bug_reports.sql
-- ============================================================

-- Bug reports table
-- Stores user-submitted bug reports with screenshot and page URL

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  message TEXT NOT NULL,
  screenshot TEXT,  -- base64 PNG data URL
  user_agent TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  reported_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'fixed', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for admin filtering
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);

-- RLS policies
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public bug reports)
DROP POLICY IF EXISTS bug_reports_insert_policy ON bug_reports;
CREATE POLICY bug_reports_insert_policy ON bug_reports
  FOR INSERT
  WITH CHECK (true);

-- Only service role can read/update (admin)
DROP POLICY IF EXISTS bug_reports_select_policy ON bug_reports;
CREATE POLICY bug_reports_select_policy ON bug_reports
  FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS bug_reports_update_policy ON bug_reports;
CREATE POLICY bug_reports_update_policy ON bug_reports
  FOR UPDATE
  USING (auth.role() = 'service_role');


-- ============================================================
-- FILE: 20260209_highlights_google_rating.sql
-- ============================================================

-- Add highlights column (separate from tags) for wizard-created establishments
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT NULL;

-- Add Google Places rating columns for real-time rating sync
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1) DEFAULT NULL;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_review_count INTEGER DEFAULT NULL;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_place_id TEXT DEFAULT NULL;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_rating_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Add google_maps_url to establishments if not already present (for public API)
-- (This column likely already exists, so IF NOT EXISTS is important)
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_maps_url TEXT DEFAULT NULL;


-- ============================================================
-- FILE: 20260209_wizard_establishment_columns.sql
-- ============================================================

-- Migration: Add wizard-related columns to establishments table
-- Date: 2026-02-09
-- Description: Adds columns required by the admin wizard for creating
--              establishment listings: admin authorship tracking,
--              Google Maps URL, and top-level category.

-- Name of the admin collaborator who created the listing via the wizard
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS admin_created_by_name text;

-- UUID of the admin collaborator who created the listing via the wizard
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS admin_created_by_id uuid;

-- Google Maps URL for the establishment (copy-pasted from Google Maps)
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS google_maps_url text;

-- Top-level category of the establishment (parent of subcategory,
-- e.g. "restaurant", "cafe", "bar", "rooftop", "patisserie", etc.)
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS category text;

-- Logo URL for the establishment (square image, 200x200px or larger).
-- Used on pro profile photo, loyalty cards, and public establishment pages.
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Name of the admin collaborator who last updated the listing
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS admin_updated_by_name text;

-- UUID of the admin collaborator who last updated the listing
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS admin_updated_by_id uuid;

-- Cover image URL for the establishment (main hero image).
-- Used on homepage cards, results cards, and establishment detail page.
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS cover_url text;

-- Gallery image URLs for the establishment (additional photos).
-- Array of public URLs stored in Supabase Storage.
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS gallery_urls text[];


-- ============================================================
-- FILE: 20260210_admin_activity_tracking.sql
-- ============================================================

-- =============================================================================
-- Admin Activity Tracking: heartbeat-based active time measurement
-- =============================================================================
-- Each row represents one heartbeat (~30s interval) from an admin collaborator.
-- active_seconds = how many seconds of actual activity detected since last heartbeat.
-- Only heartbeats with active_seconds >= 1 are stored (idle heartbeats are skipped).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_activity_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.admin_collaborators(id) ON DELETE CASCADE,
  session_id text NOT NULL,                -- unique per browser session (UUID generated client-side)
  active_seconds smallint NOT NULL DEFAULT 0
    CHECK (active_seconds >= 0 AND active_seconds <= 120),
  page_path text,                          -- current admin page path (e.g., '/admin/establishments')
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient per-user-per-day aggregation queries
CREATE INDEX IF NOT EXISTS idx_admin_heartbeats_collab_created
  ON public.admin_activity_heartbeats (collaborator_id, created_at DESC);

-- Index for date-range queries across all users
CREATE INDEX IF NOT EXISTS idx_admin_heartbeats_created
  ON public.admin_activity_heartbeats (created_at DESC);

-- =============================================================================
-- RLS: service role has full access (admin API uses service role key)
-- =============================================================================
ALTER TABLE public.admin_activity_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on admin_activity_heartbeats" ON public.admin_activity_heartbeats;
CREATE POLICY "Service role full access on admin_activity_heartbeats"
  ON public.admin_activity_heartbeats
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- SQL Function: Aggregate heartbeat stats per collaborator for a date range
-- Called via supabase.rpc('get_admin_activity_stats', { start_date, end_date })
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_activity_stats(
  start_date text,
  end_date text
)
RETURNS TABLE (
  collaborator_id uuid,
  session_count bigint,
  total_active_seconds bigint,
  first_heartbeat timestamptz,
  last_heartbeat timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    h.collaborator_id,
    COUNT(DISTINCT h.session_id) AS session_count,
    SUM(h.active_seconds::bigint) AS total_active_seconds,
    MIN(h.created_at) AS first_heartbeat,
    MAX(h.created_at) AS last_heartbeat
  FROM public.admin_activity_heartbeats h
  WHERE h.created_at >= start_date::date
    AND h.created_at < (end_date::date + interval '1 day')
  GROUP BY h.collaborator_id;
$$;

-- =============================================================================
-- SQL Function: Count establishments created by admin collaborators in a date range
-- Uses the admin_created_by_id field set by the establishment wizard
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_establishment_counts(
  start_date text,
  end_date text
)
RETURNS TABLE (
  collaborator_id uuid,
  establishment_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    e.admin_created_by_id AS collaborator_id,
    COUNT(*) AS establishment_count
  FROM public.establishments e
  WHERE e.admin_created_by_id IS NOT NULL
    AND e.created_at >= start_date::date
    AND e.created_at < (end_date::date + interval '1 day')
  GROUP BY e.admin_created_by_id;
$$;

-- =============================================================================
-- SQL Function: Cleanup heartbeats older than 90 days
-- Can be called periodically via cron or at server startup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_admin_heartbeats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.admin_activity_heartbeats
  WHERE created_at < now() - interval '90 days';
END;
$$;


-- ============================================================
-- FILE: 20260210_reservation_status_email_templates.sql
-- ============================================================

-- Migration: Add missing reservation status email templates
-- Date: 2026-02-10
-- Description: Adds email templates for when a pro confirms, refuses,
--              or cancels a reservation. Also updates no-show template CTA.

-- 1. Pro confirms reservation → email to customer
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_booking_pro_confirmed',
  'consumer',
  'Réservation confirmée par le pro',
  true,
  'Votre réservation chez {{establishment}} est confirmée ✅',
  'Bonjour {{user_name}},

Bonne nouvelle ! Votre réservation du {{date}} chez {{establishment}} a été confirmée par l''établissement.

Référence : {{booking_ref}}

Nous vous attendons avec impatience. Pensez à prévenir l''établissement si vos plans changent.

À bientôt !',
  'Voir ma réservation',
  '{{cta_url}}',
  'Your reservation at {{establishment}} is confirmed ✅',
  'Hello {{user_name}},

Great news! Your reservation on {{date}} at {{establishment}} has been confirmed by the establishment.

Reference: {{booking_ref}}

We look forward to seeing you. Please let the establishment know if your plans change.

See you soon!',
  'View my reservation'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- 2. Pro refuses reservation → email to customer
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_booking_refused',
  'consumer',
  'Réservation refusée par le pro',
  true,
  'Votre réservation chez {{establishment}} n''a pas pu être acceptée',
  'Bonjour {{user_name}},

Malheureusement, votre réservation du {{date}} chez {{establishment}} n''a pas pu être acceptée par l''établissement.

Référence : {{booking_ref}}
Motif : {{reason}}

Vous pouvez réserver un autre créneau directement sur la fiche de l''établissement.

Nous nous excusons pour la gêne occasionnée.',
  'Réserver un autre créneau',
  '{{cta_url}}',
  'Your reservation at {{establishment}} could not be accepted',
  'Hello {{user_name}},

Unfortunately, your reservation on {{date}} at {{establishment}} could not be accepted by the establishment.

Reference: {{booking_ref}}
Reason: {{reason}}

You can book another time slot directly on the establishment page.

We apologize for the inconvenience.',
  'Book another slot'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- 3. Pro cancels reservation → email to customer
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_booking_cancelled_by_pro',
  'consumer',
  'Réservation annulée par le pro',
  true,
  'Votre réservation chez {{establishment}} a été annulée',
  'Bonjour {{user_name}},

Nous sommes désolés de vous informer que votre réservation du {{date}} chez {{establishment}} a été annulée par l''établissement.

Référence : {{booking_ref}}

Si un paiement avait été effectué, le remboursement sera traité automatiquement.

Vous pouvez réserver un autre créneau sur la fiche de l''établissement.

Nous nous excusons pour la gêne occasionnée.',
  'Réserver un autre créneau',
  '{{cta_url}}',
  'Your reservation at {{establishment}} has been cancelled',
  'Hello {{user_name}},

We are sorry to inform you that your reservation on {{date}} at {{establishment}} has been cancelled by the establishment.

Reference: {{booking_ref}}

If a payment was made, the refund will be processed automatically.

You can book another time slot on the establishment page.

We apologize for the inconvenience.',
  'Book another slot'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- 4. Update no-show template CTA to use {{cta_url}} instead of {{contest_url}}
UPDATE email_templates
SET cta_url = '{{cta_url}}'
WHERE key = 'user_no_show_notification'
  AND cta_url = '{{contest_url}}';


-- ============================================================
-- FILE: 20260210_search_establishments_scored.sql
-- ============================================================

-- ============================================================================
-- CREATE search_establishments_scored FUNCTION
-- Full-text search with French stemming, trigram fuzzy matching, and scoring
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.search_establishments_scored(
  search_query text,
  filter_universe text DEFAULT NULL,
  filter_city text DEFAULT NULL,
  result_limit int DEFAULT 24,
  result_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  cover_url text,
  universe text,
  subcategory text,
  city text,
  tags text[],
  verified boolean,
  premium boolean,
  curated boolean,
  rating_avg numeric,
  google_rating numeric,
  google_review_count integer,
  relevance_score real,
  total_score real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  ts_query tsquery;
  search_text text;
  is_multiword boolean;
  word_count int;
BEGIN
  -- Normalize the search text
  search_text := trim(search_query);

  -- Detect multi-word queries
  word_count := array_length(string_to_array(search_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  -- Build tsquery using websearch_to_tsquery (handles multi-word naturally)
  -- "restaurant français" becomes 'restaurant' & 'francais' with French stemming
  BEGIN
    ts_query := websearch_to_tsquery('french', search_text);
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery('french', search_text);
  END;

  -- If tsquery is empty (e.g., all stop words), use plainto_tsquery fallback
  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery('french', search_text);
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      e.id,
      e.name,
      e.slug,
      e.cover_url,
      e.universe::text,
      e.subcategory,
      e.city,
      e.tags,
      COALESCE(e.verified, false) AS verified,
      COALESCE(e.premium, false) AS premium,
      COALESCE(e.curated, false) AS curated,
      e.avg_rating AS rating_avg,
      e.google_rating,
      e.google_review_count,
      -- Relevance score: full-text rank + trigram similarity
      (
        CASE
          WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          ELSE 0
        END
        +
        COALESCE(similarity(e.name, search_text), 0) * 0.3
      )::real AS relevance_score,
      -- Total score: relevance + activity/quality bonuses
      (
        CASE
          WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          ELSE 0
        END
        + COALESCE(similarity(e.name, search_text), 0) * 0.3
        + COALESCE(e.activity_score, 0) * 0.003
        + CASE WHEN COALESCE(e.is_online, false) THEN 0.15 ELSE 0 END
        + CASE WHEN COALESCE(e.verified, false) THEN 0.05 ELSE 0 END
        + CASE WHEN COALESCE(e.premium, false) THEN 0.10 ELSE 0 END
        + CASE WHEN COALESCE(e.curated, false) THEN 0.05 ELSE 0 END
        + COALESCE(e.avg_rating, 0) / 50.0
      )::real AS total_score
    FROM public.establishments e
    WHERE e.status = 'active'::establishment_status
      -- Universe filter
      AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
      -- City filter (case-insensitive)
      AND (filter_city IS NULL OR e.city ILIKE filter_city)
      -- Match condition depends on single vs multi-word query
      AND (
        CASE
          WHEN is_multiword THEN
            -- Multi-word: full-text search only (uses AND logic: all words must match)
            -- No trigram similarity here — it matches partial words and gives false positives
            -- ILIKE on exact phrase as last resort
            (e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
            OR (e.name ILIKE '%' || search_text || '%')
            OR (e.subcategory ILIKE '%' || search_text || '%')
          ELSE
            -- Single word: broader matching with trigram for typo tolerance
            (e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
            OR similarity(e.name, search_text) > 0.15
            OR e.name ILIKE '%' || search_text || '%'
            OR e.subcategory ILIKE '%' || search_text || '%'
        END
      )
  )
  SELECT s.*
  FROM scored s
  ORDER BY s.total_score DESC, s.relevance_score DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

-- Grant execute permissions to Supabase roles
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO authenticated;

COMMENT ON FUNCTION public.search_establishments_scored(text, text, text, int, int) IS
  'Full-text search for establishments with French stemming, trigram fuzzy matching, and activity-based scoring';

COMMIT;

