-- Reviews and Reports System
-- Migration for customer reviews with moderation workflow and establishment reports

BEGIN;

-- =============================================================================
-- TABLE: reviews
-- Stores customer reviews with full moderation workflow
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,

  -- Rating data (matches CriteriaRating.tsx criteria)
  overall_rating NUMERIC(2,1) NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
  criteria_ratings JSONB NOT NULL DEFAULT '{}',
  -- Expected shape: { accueil, cadre_ambiance, service, qualite_prestation, prix, emplacement }

  -- Content
  title TEXT,
  comment TEXT,
  anonymous BOOLEAN NOT NULL DEFAULT FALSE,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'pending_moderation'
    CHECK (status IN (
      'pending_moderation',     -- Waiting for admin review
      'sent_to_pro',            -- Admin sent to pro for response (negative review)
      'pro_responded_hidden',   -- Pro responded with promo but chose not to publish
      'approved',               -- Admin approved, published
      'rejected',               -- Admin rejected (violates terms)
      'auto_published'          -- Auto-published after 24h pro timeout
    )),

  -- Pro response tracking (for negative reviews sent to pro)
  sent_to_pro_at TIMESTAMPTZ,
  pro_response_deadline TIMESTAMPTZ,  -- sent_to_pro_at + 24h
  pro_response_type TEXT CHECK (pro_response_type IN ('promo_code', 'direct_publish', 'hide_with_promo', NULL)),
  pro_response_at TIMESTAMPTZ,
  pro_promo_code_id UUID,  -- Reference to consumer_promo_codes if promo created
  pro_reminder_sent BOOLEAN DEFAULT FALSE,

  -- Moderation tracking
  moderated_by TEXT,  -- admin user id who moderated
  moderated_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Pro public response (shown on published reviews)
  pro_public_response TEXT,
  pro_public_response_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT unique_user_reservation_review UNIQUE (user_id, reservation_id)
);

-- Indexes for reviews
CREATE INDEX IF NOT EXISTS idx_reviews_establishment_status ON public.reviews(establishment_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_establishment_published ON public.reviews(establishment_id, published_at DESC)
  WHERE status IN ('approved', 'auto_published');
CREATE INDEX IF NOT EXISTS idx_reviews_user ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_pending_moderation ON public.reviews(status, created_at)
  WHERE status = 'pending_moderation';
CREATE INDEX IF NOT EXISTS idx_reviews_sent_to_pro ON public.reviews(pro_response_deadline)
  WHERE status = 'sent_to_pro';
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

-- Comments
COMMENT ON TABLE public.reviews IS 'Customer reviews with moderation workflow';
COMMENT ON COLUMN public.reviews.status IS 'Review status: pending_moderation, sent_to_pro, pro_responded_hidden, approved, rejected, auto_published';
COMMENT ON COLUMN public.reviews.criteria_ratings IS 'JSON object with keys: accueil, cadre_ambiance, service, qualite_prestation, prix, emplacement';
COMMENT ON COLUMN public.reviews.pro_response_deadline IS '24h deadline after sent_to_pro_at for pro to respond';

-- =============================================================================
-- TABLE: establishment_reports
-- Stores user reports about establishments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  reporter_user_id TEXT,  -- Can be null for anonymous reports

  -- Report details
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'inappropriate_content',
    'false_information',
    'closed_permanently',
    'duplicate_listing',
    'spam_or_scam',
    'safety_concern',
    'harassment',
    'other'
  )),
  reason_text TEXT,  -- Additional details

  -- Status and resolution
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),
  resolved_by TEXT,  -- admin user id
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  action_taken TEXT CHECK (action_taken IN (NULL, 'none', 'warning_sent', 'content_removed', 'listing_suspended', 'listing_removed')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent spam reports from same user
  CONSTRAINT unique_reporter_establishment UNIQUE (establishment_id, reporter_user_id)
);

-- Indexes for reports
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.establishment_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_establishment ON public.establishment_reports(establishment_id);
CREATE INDEX IF NOT EXISTS idx_reports_pending ON public.establishment_reports(created_at DESC) WHERE status = 'pending';

-- Comments
COMMENT ON TABLE public.establishment_reports IS 'User reports about establishments';
COMMENT ON COLUMN public.establishment_reports.reason_code IS 'Predefined reason codes for reporting';
COMMENT ON COLUMN public.establishment_reports.action_taken IS 'Action taken after resolution';

-- =============================================================================
-- TABLE: review_invitations
-- Tracks invitations sent to users to leave reviews after their visit
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'clicked', 'completed', 'expired')),

  -- Timing
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,  -- Usually 14 days after sent
  clicked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Link to resulting review
  review_id UUID REFERENCES public.reviews(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One invitation per reservation
  CONSTRAINT unique_reservation_invitation UNIQUE (reservation_id)
);

-- Indexes for invitations
CREATE INDEX IF NOT EXISTS idx_review_invitations_token ON public.review_invitations(token);
CREATE INDEX IF NOT EXISTS idx_review_invitations_pending ON public.review_invitations(status, created_at)
  WHERE status IN ('pending', 'sent');
CREATE INDEX IF NOT EXISTS idx_review_invitations_user ON public.review_invitations(user_id);

-- Comments
COMMENT ON TABLE public.review_invitations IS 'Invitations sent to customers to leave reviews after their visit';
COMMENT ON COLUMN public.review_invitations.token IS 'Secure token for the review invitation link';
COMMENT ON COLUMN public.review_invitations.expires_at IS 'Invitation expires 14 days after being sent';

-- =============================================================================
-- TRIGGER: Update updated_at timestamp
-- =============================================================================

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
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_reports_updated_at ON public.establishment_reports;
CREATE TRIGGER trigger_reports_updated_at
  BEFORE UPDATE ON public.establishment_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTION: Update establishment rating stats
-- Called when a review is published (approved or auto_published)
-- =============================================================================

CREATE OR REPLACE FUNCTION update_establishment_rating_stats(p_establishment_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.establishments SET
    avg_rating = (
      SELECT ROUND(AVG(overall_rating)::numeric, 1)
      FROM public.reviews
      WHERE establishment_id = p_establishment_id
      AND status IN ('approved', 'auto_published')
    ),
    review_count = (
      SELECT COUNT(*)
      FROM public.reviews
      WHERE establishment_id = p_establishment_id
      AND status IN ('approved', 'auto_published')
    ),
    reviews_last_30d = (
      SELECT COUNT(*)
      FROM public.reviews
      WHERE establishment_id = p_establishment_id
      AND status IN ('approved', 'auto_published')
      AND published_at > NOW() - INTERVAL '30 days'
    )
  WHERE id = p_establishment_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_establishment_rating_stats IS 'Updates establishment avg_rating, review_count, reviews_last_30d from published reviews';

-- =============================================================================
-- RLS Policies (if RLS is enabled)
-- =============================================================================

-- Reviews: Users can read published reviews, create their own
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY reviews_select_published ON public.reviews
  FOR SELECT USING (status IN ('approved', 'auto_published') OR user_id = current_setting('app.current_user_id', true));

CREATE POLICY reviews_insert_own ON public.reviews
  FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Reports: Users can create reports, only admins can read all
ALTER TABLE public.establishment_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_insert_any ON public.establishment_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY reports_select_own ON public.establishment_reports
  FOR SELECT USING (reporter_user_id = current_setting('app.current_user_id', true));

-- Review invitations: Users can only see their own
ALTER TABLE public.review_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_select_own ON public.review_invitations
  FOR SELECT USING (user_id = current_setting('app.current_user_id', true));

COMMIT;
