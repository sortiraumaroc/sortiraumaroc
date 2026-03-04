-- =============================================================================
-- Notifications, Bannières, Push Marketing & Roue de la Chance
-- Migration SQL — sam.ma — 13 Février 2026
--
-- Tables créées :
--   MODULE A (Notification Engine) :
--     1. notification_templates       — Templates par événement × canal × langue
--     2. notification_preferences     — Préférences notification par utilisateur
--     3. notification_logs            — Log centralisé de toutes les notifications
--   MODULE B (Push Marketing) :
--     4. push_campaigns               — Campagnes push marketing
--     5. push_campaign_deliveries     — Suivi livraison par destinataire
--   MODULE C (Bannières) :
--     6. banners                      — Configuration des bannières/pop-ups
--     7. banner_views                 — Tracking vues/clics/fermetures
--     8. banner_form_responses        — Réponses formulaires bannières
--   MODULE D (Roue de la Chance) :
--     9. wheel_events                 — Événements Roue de la Chance
--    10. wheel_prizes                 — Lots/segments de la roue
--    11. wheel_external_codes         — Pool de codes externes partenaires
--    12. wheel_spins                  — Historique des spins
--   Extension :
--    13. ALTER platform_gift_distributions — Ajout colonne source
-- =============================================================================

BEGIN;

-- =============================================================================
-- MODULE A — NOTIFICATION ENGINE
-- =============================================================================

-- 1. notification_templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  lang VARCHAR(5) NOT NULL DEFAULT 'fr',

  -- Contenu
  subject TEXT DEFAULT NULL,       -- Sujet (email/push)
  body TEXT NOT NULL,              -- Corps du message
  cta_url TEXT DEFAULT NULL,       -- Lien d'action
  cta_label TEXT DEFAULT NULL,     -- Libellé du bouton

  -- Métadonnées
  variables_schema JSONB DEFAULT '[]'::jsonb,  -- [{name, description, required}]
  is_critical BOOLEAN DEFAULT false,            -- Non désactivable par l'utilisateur
  module VARCHAR(30) NOT NULL CHECK (module IN (
    'reservation', 'loyalty', 'packs', 'reviews', 'account', 'system', 'marketing', 'wheel'
  )),
  enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_notification_template UNIQUE (event_type, channel, lang)
);

CREATE INDEX IF NOT EXISTS idx_notif_tpl_event ON notification_templates(event_type);
CREATE INDEX IF NOT EXISTS idx_notif_tpl_module ON notification_templates(module);

-- 2. notification_preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  user_type VARCHAR(10) NOT NULL CHECK (user_type IN ('consumer', 'pro')),

  -- Préférences par canal
  email_transactional BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,

  -- Préférences par catégorie
  reservation_reminders BOOLEAN DEFAULT true,
  loyalty_reminders BOOLEAN DEFAULT true,
  marketing_push BOOLEAN DEFAULT true,

  -- Langue
  preferred_lang VARCHAR(5) DEFAULT 'fr',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. notification_logs
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'in_app')),

  -- Destinataire
  recipient_id TEXT NOT NULL,
  recipient_type VARCHAR(10) NOT NULL CHECK (recipient_type IN ('consumer', 'pro', 'admin')),

  -- Template utilisé
  template_id UUID DEFAULT NULL REFERENCES notification_templates(id) ON DELETE SET NULL,
  subject TEXT DEFAULT NULL,
  body_preview VARCHAR(200) DEFAULT NULL,

  -- Statut
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'delivered', 'failed', 'read'
  )),
  provider_message_id TEXT DEFAULT NULL,  -- SES Message ID, Twilio SID, FCM message ID
  error_message TEXT DEFAULT NULL,

  -- Métadonnées
  metadata JSONB DEFAULT '{}'::jsonb,
  campaign_id UUID DEFAULT NULL,  -- FK vers push_campaigns si marketing

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ DEFAULT NULL,
  delivered_at TIMESTAMPTZ DEFAULT NULL,
  read_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_log_recipient ON notification_logs(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_event ON notification_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_notif_log_campaign ON notification_logs(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_log_status ON notification_logs(status) WHERE status IN ('pending', 'failed');

-- =============================================================================
-- MODULE B — PUSH MARKETING
-- =============================================================================

-- 4. push_campaigns
CREATE TABLE IF NOT EXISTS push_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contenu
  title VARCHAR(60) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'nouveau_restaurant', 'offre', 'blog', 'video', 'evenement',
    'selection', 'saison', 'update', 'custom'
  )),
  image_url TEXT DEFAULT NULL,
  cta_url TEXT NOT NULL,

  -- Canaux (push, in_app, email)
  channels TEXT[] NOT NULL DEFAULT '{push}',

  -- Audience
  audience_type VARCHAR(10) NOT NULL DEFAULT 'all' CHECK (audience_type IN ('all', 'segment')),
  audience_filters JSONB DEFAULT '{}'::jsonb,
  audience_count INTEGER DEFAULT 0,

  -- Priorité & statut
  priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  status VARCHAR(15) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'sending', 'sent', 'cancelled'
  )),

  -- Programmation
  scheduled_at TIMESTAMPTZ DEFAULT NULL,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  cancelled_at TIMESTAMPTZ DEFAULT NULL,

  -- Statistiques
  stats_sent INTEGER DEFAULT 0,
  stats_delivered INTEGER DEFAULT 0,
  stats_opened INTEGER DEFAULT 0,
  stats_clicked INTEGER DEFAULT 0,
  stats_failed INTEGER DEFAULT 0,
  stats_unsubscribed INTEGER DEFAULT 0,

  -- Audit
  created_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_campaign_status ON push_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_push_campaign_scheduled ON push_campaigns(scheduled_at)
  WHERE status = 'scheduled';

-- 5. push_campaign_deliveries
CREATE TABLE IF NOT EXISTS push_campaign_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  channel VARCHAR(20) NOT NULL,

  -- Statut
  status VARCHAR(15) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'delivered', 'failed'
  )),

  -- Tracking
  sent_at TIMESTAMPTZ DEFAULT NULL,
  delivered_at TIMESTAMPTZ DEFAULT NULL,
  opened_at TIMESTAMPTZ DEFAULT NULL,
  clicked_at TIMESTAMPTZ DEFAULT NULL,
  error_message TEXT DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_campaign_delivery UNIQUE (campaign_id, user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_campaign ON push_campaign_deliveries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_delivery_user ON push_campaign_deliveries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_user_today ON push_campaign_deliveries(user_id, created_at)
  WHERE status IN ('sent', 'delivered');

-- =============================================================================
-- MODULE C — BANNIÈRES & POP-UPS
-- =============================================================================

-- 6. banners
CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_name VARCHAR(200) NOT NULL,

  -- Type
  type VARCHAR(20) NOT NULL CHECK (type IN (
    'image_simple', 'image_text', 'video', 'form', 'carousel', 'countdown'
  )),

  -- Contenu principal
  title VARCHAR(80) DEFAULT NULL,
  subtitle VARCHAR(150) DEFAULT NULL,
  media_url TEXT DEFAULT NULL,
  media_type VARCHAR(10) DEFAULT NULL CHECK (media_type IS NULL OR media_type IN ('image', 'video')),

  -- CTA principal
  cta_text VARCHAR(50) DEFAULT NULL,
  cta_url TEXT DEFAULT NULL,
  cta_target VARCHAR(10) DEFAULT 'same_tab' CHECK (cta_target IN ('same_tab', 'new_tab', 'external')),

  -- CTA secondaire
  secondary_cta_text VARCHAR(50) DEFAULT NULL,
  secondary_cta_url TEXT DEFAULT NULL,

  -- Contenu spécifique par type
  carousel_slides JSONB DEFAULT NULL,       -- [{image_url, title, subtitle}]
  countdown_target TIMESTAMPTZ DEFAULT NULL, -- Pour type countdown

  -- Formulaire (si type = form)
  form_fields JSONB DEFAULT NULL,            -- [{label, type, required, options?}]
  form_confirmation_message TEXT DEFAULT NULL,
  form_notify_email TEXT DEFAULT NULL,        -- Email admin notifié à chaque soumission

  -- Affichage
  display_format VARCHAR(15) NOT NULL DEFAULT 'modal' CHECK (display_format IN (
    'modal', 'bottom_sheet', 'top_banner', 'floating'
  )),
  animation VARCHAR(12) DEFAULT 'fade' CHECK (animation IN (
    'fade', 'slide_up', 'slide_down', 'zoom', 'none'
  )),
  overlay_color VARCHAR(20) DEFAULT '#000000',
  overlay_opacity SMALLINT DEFAULT 50 CHECK (overlay_opacity >= 0 AND overlay_opacity <= 100),
  close_behavior VARCHAR(20) DEFAULT 'always_visible' CHECK (close_behavior IN (
    'always_visible', 'after_delay', 'require_interaction'
  )),
  close_delay_seconds SMALLINT DEFAULT 0,
  appear_delay_type VARCHAR(15) DEFAULT 'immediate' CHECK (appear_delay_type IN (
    'immediate', 'after_seconds', 'after_scroll'
  )),
  appear_delay_value INTEGER DEFAULT 0,

  -- Ciblage
  audience_type VARCHAR(10) DEFAULT 'all' CHECK (audience_type IN ('all', 'segment')),
  audience_filters JSONB DEFAULT '{}'::jsonb,
  trigger VARCHAR(20) DEFAULT 'on_app_open' CHECK (trigger IN (
    'on_login', 'on_app_open', 'on_page', 'after_inactivity'
  )),
  trigger_page TEXT DEFAULT NULL,             -- URL/path pour trigger on_page
  frequency VARCHAR(15) DEFAULT 'once' CHECK (frequency IN (
    'once', 'daily', 'weekly', 'every_session'
  )),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  priority SMALLINT DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  platform VARCHAR(10) DEFAULT 'both' CHECK (platform IN ('web', 'mobile', 'both')),

  -- Statut
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'active', 'paused', 'expired', 'disabled'
  )),

  -- Statistiques (compteurs dénormalisés)
  stats_impressions INTEGER DEFAULT 0,
  stats_clicks INTEGER DEFAULT 0,
  stats_closes INTEGER DEFAULT 0,
  stats_form_submissions INTEGER DEFAULT 0,

  -- Audit
  created_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banners_status ON banners(status);
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(priority DESC, start_date, end_date)
  WHERE status = 'active';

-- 7. banner_views
CREATE TABLE IF NOT EXISTS banner_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id UUID NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  user_id TEXT DEFAULT NULL,
  session_id TEXT DEFAULT NULL,
  action VARCHAR(15) NOT NULL CHECK (action IN ('view', 'click', 'close', 'form_submit')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banner_views_banner ON banner_views(banner_id, action);
CREATE INDEX IF NOT EXISTS idx_banner_views_user ON banner_views(user_id, banner_id, action)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_banner_views_date ON banner_views(created_at);

-- 8. banner_form_responses
CREATE TABLE IF NOT EXISTS banner_form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id UUID NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  user_id TEXT DEFAULT NULL,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banner_form_banner ON banner_form_responses(banner_id);

-- =============================================================================
-- MODULE D — ROUE DE LA CHANCE
-- =============================================================================

-- 9. wheel_events
CREATE TABLE IF NOT EXISTS wheel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,

  -- Période
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,

  -- Règles
  spins_per_day SMALLINT DEFAULT 1 CHECK (spins_per_day >= 1 AND spins_per_day <= 10),
  eligibility VARCHAR(10) DEFAULT 'all' CHECK (eligibility IN ('all', 'segment')),
  eligibility_filters JSONB DEFAULT '{}'::jsonb,

  -- Messages
  welcome_message TEXT DEFAULT 'Tentez votre chance et gagnez des cadeaux !',
  already_played_message TEXT DEFAULT 'Revenez demain pour une nouvelle chance !',

  -- Thème visuel
  theme JSONB DEFAULT '{}'::jsonb,
  -- Exemple : {background_image, primary_color, secondary_color, particle_type}

  -- Statut
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'active', 'paused', 'ended'
  )),

  -- Statistiques dénormalisées
  stats_total_spins INTEGER DEFAULT 0,
  stats_total_wins INTEGER DEFAULT 0,
  stats_total_losses INTEGER DEFAULT 0,

  -- Audit
  created_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_events_status ON wheel_events(status);
CREATE INDEX IF NOT EXISTS idx_wheel_events_active ON wheel_events(start_date, end_date)
  WHERE status = 'active';

-- 10. wheel_prizes
CREATE TABLE IF NOT EXISTS wheel_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_event_id UUID NOT NULL REFERENCES wheel_events(id) ON DELETE CASCADE,

  -- Description du lot
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  type VARCHAR(25) NOT NULL CHECK (type IN (
    'physical_gift', 'percentage_discount', 'fixed_discount', 'free_service',
    'external_code', 'points', 'retry', 'nothing'
  )),

  -- Établissement partenaire (nullable pour retry/nothing/external_code)
  establishment_id UUID DEFAULT NULL,

  -- Valeur (en centimes ou pourcentage selon le type)
  value INTEGER DEFAULT NULL,
  value_currency VARCHAR(5) DEFAULT 'MAD',

  -- Stock
  total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
  remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),

  -- Probabilité (en %, la somme doit = 100 pour un wheel_event)
  probability DECIMAL(5, 2) NOT NULL CHECK (probability >= 0 AND probability <= 100),

  -- Lot de substitution quand stock épuisé
  substitute_prize_id UUID DEFAULT NULL REFERENCES wheel_prizes(id) ON DELETE SET NULL,

  -- Visuel
  segment_color VARCHAR(20) DEFAULT '#FF6B6B',
  segment_icon VARCHAR(50) DEFAULT NULL,

  -- Validité du cadeau gagné
  gift_validity_days INTEGER DEFAULT 7 CHECK (gift_validity_days >= 1),

  -- Conditions
  conditions TEXT DEFAULT NULL,

  -- Position sur la roue
  sort_order SMALLINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_prizes_event ON wheel_prizes(wheel_event_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wheel_prizes_stock ON wheel_prizes(wheel_event_id, remaining_quantity)
  WHERE remaining_quantity > 0;

-- 11. wheel_external_codes
CREATE TABLE IF NOT EXISTS wheel_external_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id UUID NOT NULL REFERENCES wheel_prizes(id) ON DELETE CASCADE,

  -- Code
  code TEXT NOT NULL,
  partner_name VARCHAR(200) NOT NULL,
  partner_url TEXT DEFAULT NULL,

  -- Attribution
  assigned_to TEXT DEFAULT NULL,               -- user_id du gagnant
  assigned_at TIMESTAMPTZ DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_external_code UNIQUE (prize_id, code)
);

CREATE INDEX IF NOT EXISTS idx_wheel_codes_prize ON wheel_external_codes(prize_id)
  WHERE assigned_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_wheel_codes_user ON wheel_external_codes(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- 12. wheel_spins
CREATE TABLE IF NOT EXISTS wheel_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_event_id UUID NOT NULL REFERENCES wheel_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  -- Anti-replay
  spin_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

  -- Résultat
  result VARCHAR(5) NOT NULL CHECK (result IN ('won', 'lost')),
  prize_id UUID DEFAULT NULL REFERENCES wheel_prizes(id) ON DELETE SET NULL,
  prize_name VARCHAR(100) DEFAULT NULL,        -- Snapshot du nom du lot
  prize_type VARCHAR(25) DEFAULT NULL,         -- Snapshot du type

  -- Liens vers cadeaux distribués
  gift_distribution_id UUID DEFAULT NULL,      -- FK platform_gift_distributions si cadeau physique
  external_code_id UUID DEFAULT NULL REFERENCES wheel_external_codes(id) ON DELETE SET NULL,

  -- Position sur la roue (pour animation côté client)
  segment_index SMALLINT DEFAULT 0,

  -- Anti-triche
  device_id TEXT DEFAULT NULL,
  ip_address INET DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_spins_user ON wheel_spins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_event ON wheel_spins(wheel_event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_user_day ON wheel_spins(user_id, wheel_event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_fraud ON wheel_spins(device_id, created_at)
  WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wheel_spins_ip_fraud ON wheel_spins(ip_address, created_at)
  WHERE ip_address IS NOT NULL;

-- =============================================================================
-- EXTENSION TABLE EXISTANTE : platform_gift_distributions
-- =============================================================================

-- Ajout colonne source pour distinguer l'origine de la distribution
ALTER TABLE platform_gift_distributions
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'admin_manual';

-- Migrer les données existantes : source = distribution_method
UPDATE platform_gift_distributions
  SET source = distribution_method
  WHERE source = 'admin_manual' AND distribution_method != 'manual';

-- Index sur source pour filtrer les cadeaux roue
CREATE INDEX IF NOT EXISTS idx_platform_gift_dist_source
  ON platform_gift_distributions(source)
  WHERE source = 'wheel_of_fortune';

-- Rendre platform_gift_id nullable pour les cadeaux roue
-- (les cadeaux roue n'ont pas de platform_gift parent)
ALTER TABLE platform_gift_distributions
  ALTER COLUMN platform_gift_id DROP NOT NULL;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_campaign_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_external_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_spins ENABLE ROW LEVEL SECURITY;

-- Policies (accès via service_role, pas besoin de filtrage fin côté RLS)
DROP POLICY IF EXISTS notif_tpl_read ON notification_templates;
CREATE POLICY notif_tpl_read ON notification_templates FOR SELECT USING (true);
DROP POLICY IF EXISTS notif_prefs_read ON notification_preferences;
CREATE POLICY notif_prefs_read ON notification_preferences FOR SELECT USING (true);
DROP POLICY IF EXISTS notif_logs_read ON notification_logs;
CREATE POLICY notif_logs_read ON notification_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS push_campaigns_read ON push_campaigns;
CREATE POLICY push_campaigns_read ON push_campaigns FOR SELECT USING (true);
DROP POLICY IF EXISTS push_deliveries_read ON push_campaign_deliveries;
CREATE POLICY push_deliveries_read ON push_campaign_deliveries FOR SELECT USING (true);
DROP POLICY IF EXISTS banners_read ON banners;
CREATE POLICY banners_read ON banners FOR SELECT USING (true);
DROP POLICY IF EXISTS banner_views_read ON banner_views;
CREATE POLICY banner_views_read ON banner_views FOR SELECT USING (true);
DROP POLICY IF EXISTS banner_form_resp_read ON banner_form_responses;
CREATE POLICY banner_form_resp_read ON banner_form_responses FOR SELECT USING (true);
DROP POLICY IF EXISTS wheel_events_read ON wheel_events;
CREATE POLICY wheel_events_read ON wheel_events FOR SELECT USING (true);
DROP POLICY IF EXISTS wheel_prizes_read ON wheel_prizes;
CREATE POLICY wheel_prizes_read ON wheel_prizes FOR SELECT USING (true);
DROP POLICY IF EXISTS wheel_ext_codes_read ON wheel_external_codes;
CREATE POLICY wheel_ext_codes_read ON wheel_external_codes FOR SELECT USING (true);
DROP POLICY IF EXISTS wheel_spins_read ON wheel_spins;
CREATE POLICY wheel_spins_read ON wheel_spins FOR SELECT USING (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE notification_templates IS 'Templates de notifications par événement, canal et langue';
COMMENT ON TABLE notification_preferences IS 'Préférences de notification par utilisateur (consumer ou pro)';
COMMENT ON TABLE notification_logs IS 'Log centralisé de toutes les notifications envoyées (email, SMS, push, in-app)';
COMMENT ON TABLE push_campaigns IS 'Campagnes push marketing créées par l admin';
COMMENT ON TABLE push_campaign_deliveries IS 'Suivi de livraison par destinataire pour chaque campagne';
COMMENT ON TABLE banners IS 'Bannières publicitaires et pop-ups configurables par l admin';
COMMENT ON TABLE banner_views IS 'Tracking des impressions, clics, fermetures et soumissions de bannières';
COMMENT ON TABLE banner_form_responses IS 'Réponses aux formulaires intégrés dans les bannières';
COMMENT ON TABLE wheel_events IS 'Événements Roue de la Chance (Ramadan, anniversaire, etc.)';
COMMENT ON TABLE wheel_prizes IS 'Lots/segments configurés pour chaque roue';
COMMENT ON TABLE wheel_external_codes IS 'Pool de codes externes partenaires pour les lots external_code';
COMMENT ON TABLE wheel_spins IS 'Historique de tous les spins avec résultats et données anti-triche';

COMMENT ON COLUMN platform_gift_distributions.source IS 'Origine de la distribution : admin_manual, criteria_based, first_come, wheel_of_fortune';

COMMIT;
