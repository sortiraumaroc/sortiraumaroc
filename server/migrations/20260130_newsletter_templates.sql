-- ============================================================================
-- NEWSLETTER TEMPLATES & BUILDER SYSTEM
-- Migration: 20260130_newsletter_templates.sql
-- Description: Comprehensive newsletter system for marketing campaigns
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Newsletter Templates Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic Info
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    -- Categories: launch, promotion, contest, ramadan, seasonal, events, pros, users, partners

    -- Target Audience
    audience TEXT NOT NULL DEFAULT 'all',
    -- Audiences: all, users, pros, partners, prospects

    -- Content (Bilingual)
    subject_fr TEXT NOT NULL,
    subject_en TEXT NOT NULL,
    preheader_fr TEXT, -- Preview text shown in inbox
    preheader_en TEXT,

    -- Template Structure (JSON blocks for drag-drop editor)
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Each block: { type, content_fr, content_en, settings }
    -- Block types: header, text, image, button, divider, spacer, columns, list, video, social, poll, countdown

    -- Design Settings
    design_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- { backgroundColor, fontFamily, headerColor, textColor, buttonColor, buttonTextColor, borderRadius }

    -- Thumbnail for template gallery
    thumbnail_url TEXT,

    -- Status
    is_template BOOLEAN NOT NULL DEFAULT true, -- true = reusable template, false = one-time draft
    is_featured BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,

    -- Usage Stats
    times_used INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for newsletter_templates
CREATE INDEX IF NOT EXISTS idx_newsletter_templates_category ON newsletter_templates(category);
CREATE INDEX IF NOT EXISTS idx_newsletter_templates_audience ON newsletter_templates(audience);
CREATE INDEX IF NOT EXISTS idx_newsletter_templates_enabled ON newsletter_templates(enabled);
CREATE INDEX IF NOT EXISTS idx_newsletter_templates_featured ON newsletter_templates(is_featured) WHERE is_featured = true;

-- ----------------------------------------------------------------------------
-- 2. Newsletter Campaigns Table (extends email_campaigns for newsletter-specific data)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to newsletter template
    template_id UUID REFERENCES newsletter_templates(id) ON DELETE SET NULL,

    -- Campaign Info
    name TEXT NOT NULL,
    internal_notes TEXT,

    -- Content (can override template)
    subject_fr TEXT NOT NULL,
    subject_en TEXT NOT NULL,
    preheader_fr TEXT,
    preheader_en TEXT,
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    design_settings JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Targeting
    audience TEXT NOT NULL DEFAULT 'all',
    target_tags TEXT[] DEFAULT '{}',
    target_cities TEXT[] DEFAULT '{}',
    target_query JSONB, -- Advanced targeting rules

    -- A/B Testing
    ab_test_enabled BOOLEAN NOT NULL DEFAULT false,
    ab_variant_subject_fr TEXT,
    ab_variant_subject_en TEXT,
    ab_test_percentage INTEGER DEFAULT 10, -- % of audience for test

    -- Scheduling
    status TEXT NOT NULL DEFAULT 'draft',
    -- Status: draft, scheduled, sending, sent, paused, cancelled
    scheduled_at TIMESTAMPTZ,
    timezone TEXT DEFAULT 'Africa/Casablanca',

    -- Send Progress
    send_started_at TIMESTAMPTZ,
    send_finished_at TIMESTAMPTZ,

    -- Stats
    total_recipients INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    opened_count INTEGER NOT NULL DEFAULT 0,
    clicked_count INTEGER NOT NULL DEFAULT 0,
    bounced_count INTEGER NOT NULL DEFAULT 0,
    complained_count INTEGER NOT NULL DEFAULT 0,
    unsubscribed_count INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for newsletter_campaigns
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_status ON newsletter_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_scheduled ON newsletter_campaigns(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_template ON newsletter_campaigns(template_id);

-- ----------------------------------------------------------------------------
-- 3. Newsletter Assets Table (for uploaded images, videos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- File Info
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,

    -- Storage
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,

    -- Image Dimensions (if applicable)
    width INTEGER,
    height INTEGER,

    -- Organization
    folder TEXT DEFAULT 'general',
    tags TEXT[] DEFAULT '{}',

    -- Usage tracking
    usage_count INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for newsletter_assets
CREATE INDEX IF NOT EXISTS idx_newsletter_assets_folder ON newsletter_assets(folder);
CREATE INDEX IF NOT EXISTS idx_newsletter_assets_mime ON newsletter_assets(mime_type);

-- ----------------------------------------------------------------------------
-- 4. Newsletter Saved Blocks (reusable content blocks)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_saved_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    -- Categories: headers, footers, cta, testimonials, products, social, legal

    -- Block Content
    block_type TEXT NOT NULL,
    content_fr JSONB NOT NULL,
    content_en JSONB NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Preview
    thumbnail_url TEXT,

    -- Usage
    times_used INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_newsletter_saved_blocks_category ON newsletter_saved_blocks(category);
CREATE INDEX IF NOT EXISTS idx_newsletter_saved_blocks_type ON newsletter_saved_blocks(block_type);

-- ----------------------------------------------------------------------------
-- 5. Triggers for updated_at
-- ----------------------------------------------------------------------------
CREATE TRIGGER set_newsletter_templates_updated_at
    BEFORE UPDATE ON newsletter_templates
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_newsletter_campaigns_updated_at
    BEFORE UPDATE ON newsletter_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_newsletter_saved_blocks_updated_at
    BEFORE UPDATE ON newsletter_saved_blocks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE newsletter_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_saved_blocks ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_newsletter_templates" ON newsletter_templates FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_newsletter_campaigns" ON newsletter_campaigns FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_newsletter_assets" ON newsletter_assets FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_newsletter_saved_blocks" ON newsletter_saved_blocks FOR ALL TO service_role USING (true);

-- ----------------------------------------------------------------------------
-- 7. Seed Default Newsletter Templates (30+ templates)
-- ----------------------------------------------------------------------------

-- CATEGORY: LAUNCH - Platform Launch Templates
INSERT INTO newsletter_templates (name, description, category, audience, subject_fr, subject_en, preheader_fr, preheader_en, blocks, design_settings, is_featured) VALUES

-- 1. Grand Launch Announcement
('Lancement Sortir Au Maroc', 'Annonce officielle du lancement de la plateforme', 'launch', 'all',
 'Sortir Au Maroc est enfin là !', 'Sortir Au Maroc is finally here!',
 'Découvrez la nouvelle façon de réserver vos sorties au Maroc', 'Discover the new way to book your outings in Morocco',
 '[
   {"type": "header", "content_fr": {"title": "Bienvenue sur Sortir Au Maroc", "subtitle": "La plateforme qui révolutionne vos sorties"}, "content_en": {"title": "Welcome to Sortir Au Maroc", "subtitle": "The platform revolutionizing your outings"}, "settings": {"backgroundColor": "#D4AF37", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{hero_image}}", "alt": "Sortir Au Maroc"}, "content_en": {"url": "{{hero_image}}", "alt": "Sortir Au Maroc"}, "settings": {"fullWidth": true}},
   {"type": "text", "content_fr": {"html": "<p>Chers amis,</p><p>Nous sommes ravis de vous annoncer le lancement officiel de <strong>Sortir Au Maroc</strong>, votre nouvelle destination pour découvrir et réserver les meilleures expériences au Maroc.</p>"}, "content_en": {"html": "<p>Dear friends,</p><p>We are thrilled to announce the official launch of <strong>Sortir Au Maroc</strong>, your new destination to discover and book the best experiences in Morocco.</p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["Restaurants gastronomiques", "Hôtels de charme", "Activités culturelles", "Bien-être & Spa", "Shopping exclusif"]}, "content_en": {"items": ["Gourmet restaurants", "Boutique hotels", "Cultural activities", "Wellness & Spa", "Exclusive shopping"]}, "settings": {"style": "check"}},
   {"type": "button", "content_fr": {"text": "Découvrir maintenant", "url": "{{cta_url}}"}, "content_en": {"text": "Discover now", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#D4AF37", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#D4AF37", "textColor": "#333333", "buttonColor": "#D4AF37", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 2. Early Access Invitation
('Accès Anticipé VIP', 'Invitation exclusive pour accès anticipé', 'launch', 'prospects',
 'Vous êtes invité(e) à découvrir Sortir Au Maroc en avant-première', 'You are invited to discover Sortir Au Maroc early',
 'Accès exclusif réservé aux membres VIP', 'Exclusive access for VIP members',
 '[
   {"type": "header", "content_fr": {"title": "Invitation VIP", "subtitle": "Accès anticipé exclusif"}, "content_en": {"title": "VIP Invitation", "subtitle": "Exclusive early access"}, "settings": {"backgroundColor": "#1a1a1a", "textColor": "#D4AF37"}},
   {"type": "text", "content_fr": {"html": "<p>Cher(e) {{first_name}},</p><p>Vous faites partie des privilégiés sélectionnés pour découvrir <strong>Sortir Au Maroc</strong> en avant-première.</p><p>Profitez de cette opportunité unique pour explorer notre plateforme avant tout le monde et bénéficiez d''avantages exclusifs.</p>"}, "content_en": {"html": "<p>Dear {{first_name}},</p><p>You have been selected to discover <strong>Sortir Au Maroc</strong> before everyone else.</p><p>Take advantage of this unique opportunity to explore our platform first and enjoy exclusive benefits.</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "🎁", "title": "10% de réduction", "text": "Sur votre première réservation"}, {"icon": "⭐", "title": "Statut VIP", "text": "Accès prioritaire permanent"}, {"icon": "🎉", "title": "Événements privés", "text": "Invitations exclusives"}]}, "content_en": {"columns": [{"icon": "🎁", "title": "10% discount", "text": "On your first booking"}, {"icon": "⭐", "title": "VIP Status", "text": "Permanent priority access"}, {"icon": "🎉", "title": "Private events", "text": "Exclusive invitations"}]}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Activer mon accès VIP", "url": "{{cta_url}}"}, "content_en": {"text": "Activate my VIP access", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#D4AF37", "textColor": "#1a1a1a", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#f5f5f5", "fontFamily": "Georgia, serif", "headerColor": "#1a1a1a", "textColor": "#333333", "buttonColor": "#D4AF37", "buttonTextColor": "#1a1a1a"}'::jsonb,
 true),

-- 3. Launch for Professionals
('Lancement Pros - Rejoignez-nous', 'Invitation aux professionnels pour rejoindre la plateforme', 'launch', 'pros',
 'Professionnels : Rejoignez Sortir Au Maroc et développez votre activité', 'Professionals: Join Sortir Au Maroc and grow your business',
 'Nouvelle opportunité pour les établissements marocains', 'New opportunity for Moroccan businesses',
 '[
   {"type": "header", "content_fr": {"title": "Développez votre activité", "subtitle": "Rejoignez le réseau Sortir Au Maroc"}, "content_en": {"title": "Grow your business", "subtitle": "Join the Sortir Au Maroc network"}, "settings": {"backgroundColor": "#2C5530", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Cher professionnel,</p><p>Sortir Au Maroc lance sa plateforme et nous cherchons les meilleurs établissements du Maroc pour rejoindre notre réseau.</p><p><strong>Pourquoi nous rejoindre ?</strong></p>"}, "content_en": {"html": "<p>Dear professional,</p><p>Sortir Au Maroc is launching its platform and we are looking for the best establishments in Morocco to join our network.</p><p><strong>Why join us?</strong></p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["Visibilité auprès de milliers de clients potentiels", "Système de réservation simple et efficace", "Gestion centralisée de vos disponibilités", "Support dédié 7j/7", "Commission attractive et transparente"]}, "content_en": {"items": ["Visibility to thousands of potential customers", "Simple and efficient booking system", "Centralized availability management", "Dedicated 7/7 support", "Attractive and transparent commission"]}, "settings": {"style": "arrow"}},
   {"type": "button", "content_fr": {"text": "Inscrire mon établissement", "url": "{{cta_url}}"}, "content_en": {"text": "Register my establishment", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#2C5530", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#2C5530", "textColor": "#333333", "buttonColor": "#2C5530", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- CATEGORY: PROMOTION - Partnership & Deals
-- 4. Restaurant Partnership Promotion
('Promo Restaurant Partenaire', 'Promotion en partenariat avec un restaurant', 'promotion', 'users',
 '{{establishment_name}} vous offre -20% ce week-end !', '{{establishment_name}} offers you -20% this weekend!',
 'Offre exclusive réservée aux membres Sortir Au Maroc', 'Exclusive offer for Sortir Au Maroc members',
 '[
   {"type": "header", "content_fr": {"title": "Offre Exclusive", "subtitle": "En partenariat avec {{establishment_name}}"}, "content_en": {"title": "Exclusive Offer", "subtitle": "In partnership with {{establishment_name}}"}, "settings": {"backgroundColor": "#C41E3A", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{establishment_image}}", "alt": "{{establishment_name}}"}, "content_en": {"url": "{{establishment_image}}", "alt": "{{establishment_name}}"}, "settings": {"fullWidth": true, "borderRadius": "8px"}},
   {"type": "text", "content_fr": {"html": "<p>Cher(e) {{first_name}},</p><p>Cette semaine, nous avons le plaisir de vous proposer une offre exceptionnelle en partenariat avec <strong>{{establishment_name}}</strong>.</p><p style=\"font-size: 24px; color: #C41E3A; text-align: center;\"><strong>-20% sur l''addition</strong></p><p>Valable ce week-end uniquement sur présentation de ce code.</p>"}, "content_en": {"html": "<p>Dear {{first_name}},</p><p>This week, we are pleased to offer you an exceptional deal in partnership with <strong>{{establishment_name}}</strong>.</p><p style=\"font-size: 24px; color: #C41E3A; text-align: center;\"><strong>-20% on your bill</strong></p><p>Valid this weekend only upon presentation of this code.</p>"}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<div style=\"background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px;\"><p style=\"margin: 0; font-size: 12px; color: #666;\">Votre code promo</p><p style=\"margin: 10px 0 0; font-size: 28px; font-weight: bold; letter-spacing: 3px;\">{{promo_code}}</p></div>"}, "content_en": {"html": "<div style=\"background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px;\"><p style=\"margin: 0; font-size: 12px; color: #666;\">Your promo code</p><p style=\"margin: 10px 0 0; font-size: 28px; font-weight: bold; letter-spacing: 3px;\">{{promo_code}}</p></div>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Réserver maintenant", "url": "{{cta_url}}"}, "content_en": {"text": "Book now", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#C41E3A", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#C41E3A", "textColor": "#333333", "buttonColor": "#C41E3A", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 5. Hotel Weekend Deal
('Weekend Hôtel Deal', 'Offre week-end hôtel partenaire', 'promotion', 'users',
 'Escapade de rêve : -30% sur votre séjour à {{hotel_name}}', 'Dream getaway: -30% on your stay at {{hotel_name}}',
 'Offre limitée - Réservez maintenant', 'Limited offer - Book now',
 '[
   {"type": "header", "content_fr": {"title": "Escapade de Rêve", "subtitle": "-30% sur votre séjour"}, "content_en": {"title": "Dream Getaway", "subtitle": "-30% on your stay"}, "settings": {"backgroundColor": "#1a365d", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{hotel_image}}", "alt": "{{hotel_name}}"}, "content_en": {"url": "{{hotel_image}}", "alt": "{{hotel_name}}"}, "settings": {"fullWidth": true}},
   {"type": "text", "content_fr": {"html": "<p>Envie d''une escapade ? <strong>{{hotel_name}}</strong> vous propose une offre irrésistible pour ce week-end.</p>"}, "content_en": {"html": "<p>Craving a getaway? <strong>{{hotel_name}}</strong> has an irresistible offer for this weekend.</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "🛏️", "title": "Chambre Deluxe", "text": "Petit-déjeuner inclus"}, {"icon": "🏊", "title": "Accès Spa", "text": "Piscine & Hammam"}, {"icon": "🍽️", "title": "Dîner", "text": "-15% au restaurant"}]}, "content_en": {"columns": [{"icon": "🛏️", "title": "Deluxe Room", "text": "Breakfast included"}, {"icon": "🏊", "title": "Spa Access", "text": "Pool & Hammam"}, {"icon": "🍽️", "title": "Dinner", "text": "-15% at restaurant"}]}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Réserver mon escapade", "url": "{{cta_url}}"}, "content_en": {"text": "Book my getaway", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#D4AF37", "textColor": "#1a365d", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#f8fafc", "fontFamily": "Georgia, serif", "headerColor": "#1a365d", "textColor": "#333333", "buttonColor": "#D4AF37", "buttonTextColor": "#1a365d"}'::jsonb,
 false),

-- 6. Flash Sale
('Vente Flash 24h', 'Promotion flash limitée dans le temps', 'promotion', 'all',
 '⚡ VENTE FLASH : -50% pendant 24h seulement !', '⚡ FLASH SALE: -50% for 24 hours only!',
 'Ne manquez pas cette offre exceptionnelle', 'Do not miss this exceptional offer',
 '[
   {"type": "header", "content_fr": {"title": "⚡ VENTE FLASH ⚡", "subtitle": "24 heures seulement"}, "content_en": {"title": "⚡ FLASH SALE ⚡", "subtitle": "24 hours only"}, "settings": {"backgroundColor": "#FF4500", "textColor": "#FFFFFF"}},
   {"type": "countdown", "content_fr": {"endDate": "{{countdown_end}}", "text": "Fin de l''offre dans"}, "content_en": {"endDate": "{{countdown_end}}", "text": "Offer ends in"}, "settings": {"backgroundColor": "#1a1a1a", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center; font-size: 36px; color: #FF4500;\"><strong>-50%</strong></p><p style=\"text-align: center;\">Sur une sélection de restaurants, hôtels et activités</p>"}, "content_en": {"html": "<p style=\"text-align: center; font-size: 36px; color: #FF4500;\"><strong>-50%</strong></p><p style=\"text-align: center;\">On a selection of restaurants, hotels and activities</p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "J''en profite maintenant", "url": "{{cta_url}}"}, "content_en": {"text": "Get it now", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#FF4500", "textColor": "#FFFFFF", "align": "center", "size": "large"}}
 ]'::jsonb,
 '{"backgroundColor": "#1a1a1a", "fontFamily": "Arial, sans-serif", "headerColor": "#FF4500", "textColor": "#FFFFFF", "buttonColor": "#FF4500", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- CATEGORY: CONTEST - Jeux Concours
-- 7. Photo Contest
('Concours Photo', 'Jeu concours photo sur les réseaux sociaux', 'contest', 'all',
 '📸 Participez à notre concours photo et gagnez un séjour de luxe !', '📸 Enter our photo contest and win a luxury stay!',
 'Partagez vos plus belles photos et tentez votre chance', 'Share your best photos and try your luck',
 '[
   {"type": "header", "content_fr": {"title": "Concours Photo", "subtitle": "Gagnez un séjour de luxe"}, "content_en": {"title": "Photo Contest", "subtitle": "Win a luxury stay"}, "settings": {"backgroundColor": "#8B5CF6", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{contest_image}}", "alt": "Concours photo"}, "content_en": {"url": "{{contest_image}}", "alt": "Photo contest"}, "settings": {"fullWidth": true}},
   {"type": "text", "content_fr": {"html": "<p>Partagez vos plus belles photos de sorties au Maroc et tentez de gagner un <strong>séjour de luxe pour 2 personnes</strong> dans l''un de nos hôtels partenaires !</p><p><strong>Comment participer ?</strong></p>"}, "content_en": {"html": "<p>Share your best photos of outings in Morocco and try to win a <strong>luxury stay for 2</strong> in one of our partner hotels!</p><p><strong>How to participate?</strong></p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["Prenez une photo lors d''une sortie", "Publiez-la sur Instagram avec #SortirAuMaroc", "Identifiez @sortiaumaroc", "Croisez les doigts !"]}, "content_en": {"items": ["Take a photo during an outing", "Post it on Instagram with #SortirAuMaroc", "Tag @sortiaumaroc", "Cross your fingers!"]}, "settings": {"style": "number"}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center; background: #f5f5f5; padding: 15px; border-radius: 8px;\"><strong>🎁 À GAGNER</strong><br/>Un séjour de 2 nuits pour 2 personnes<br/>+ Dîner gastronomique offert</p>"}, "content_en": {"html": "<p style=\"text-align: center; background: #f5f5f5; padding: 15px; border-radius: 8px;\"><strong>🎁 PRIZE</strong><br/>A 2-night stay for 2 people<br/>+ Complimentary gourmet dinner</p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Voir les règles du concours", "url": "{{cta_url}}"}, "content_en": {"text": "See contest rules", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#8B5CF6", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#8B5CF6", "textColor": "#333333", "buttonColor": "#8B5CF6", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 8. Quiz Contest
('Quiz Concours', 'Quiz avec lots à gagner', 'contest', 'users',
 '🧠 Testez vos connaissances et gagnez des réductions !', '🧠 Test your knowledge and win discounts!',
 'Quiz spécial avec des lots à gagner chaque semaine', 'Special quiz with prizes to win every week',
 '[
   {"type": "header", "content_fr": {"title": "Quiz de la Semaine", "subtitle": "Des lots à gagner !"}, "content_en": {"title": "Weekly Quiz", "subtitle": "Prizes to win!"}, "settings": {"backgroundColor": "#059669", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Cette semaine, testez vos connaissances sur la gastronomie marocaine et tentez de gagner des bons de réduction !</p><p><strong>Question de la semaine :</strong></p><p style=\"font-size: 18px; background: #f0fdf4; padding: 20px; border-radius: 8px; border-left: 4px solid #059669;\">Quel est l''ingrédient principal du célèbre tajine marocain aux pruneaux ?</p>"}, "content_en": {"html": "<p>This week, test your knowledge of Moroccan cuisine and try to win discount vouchers!</p><p><strong>Question of the week:</strong></p><p style=\"font-size: 18px; background: #f0fdf4; padding: 20px; border-radius: 8px; border-left: 4px solid #059669;\">What is the main ingredient of the famous Moroccan prune tagine?</p>"}, "settings": {}},
   {"type": "poll", "content_fr": {"question": "Votre réponse", "options": ["Poulet", "Agneau", "Boeuf", "Poisson"]}, "content_en": {"question": "Your answer", "options": ["Chicken", "Lamb", "Beef", "Fish"]}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center;\"><strong>🎁 À gagner :</strong> 3 bons de 50 MAD</p>"}, "content_en": {"html": "<p style=\"text-align: center;\"><strong>🎁 To win:</strong> 3 vouchers of 50 MAD</p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Participer au quiz", "url": "{{cta_url}}"}, "content_en": {"text": "Take the quiz", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#059669", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#059669", "textColor": "#333333", "buttonColor": "#059669", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 9. Referral Contest
('Parrainage Concours', 'Programme de parrainage avec récompenses', 'contest', 'users',
 '🤝 Parrainez vos amis et gagnez jusqu''à 500 MAD !', '🤝 Refer your friends and win up to 500 MAD!',
 'Plus vous parrainez, plus vous gagnez', 'The more you refer, the more you win',
 '[
   {"type": "header", "content_fr": {"title": "Programme Parrainage", "subtitle": "Gagnez jusqu''à 500 MAD"}, "content_en": {"title": "Referral Program", "subtitle": "Win up to 500 MAD"}, "settings": {"backgroundColor": "#0891B2", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>{{first_name}}, partagez Sortir Au Maroc avec vos proches et gagnez des récompenses !</p>"}, "content_en": {"html": "<p>{{first_name}}, share Sortir Au Maroc with your loved ones and earn rewards!</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "1️⃣", "title": "1 parrainage", "text": "50 MAD offerts"}, {"icon": "3️⃣", "title": "3 parrainages", "text": "200 MAD offerts"}, {"icon": "5️⃣", "title": "5+ parrainages", "text": "500 MAD offerts"}]}, "content_en": {"columns": [{"icon": "1️⃣", "title": "1 referral", "text": "50 MAD offered"}, {"icon": "3️⃣", "title": "3 referrals", "text": "200 MAD offered"}, {"icon": "5️⃣", "title": "5+ referrals", "text": "500 MAD offered"}]}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<div style=\"background: #f0f9ff; padding: 20px; text-align: center; border-radius: 8px;\"><p style=\"margin: 0; font-size: 12px; color: #666;\">Votre code de parrainage</p><p style=\"margin: 10px 0 0; font-size: 24px; font-weight: bold;\">{{referral_code}}</p></div>"}, "content_en": {"html": "<div style=\"background: #f0f9ff; padding: 20px; text-align: center; border-radius: 8px;\"><p style=\"margin: 0; font-size: 12px; color: #666;\">Your referral code</p><p style=\"margin: 10px 0 0; font-size: 24px; font-weight: bold;\">{{referral_code}}</p></div>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Partager mon code", "url": "{{cta_url}}"}, "content_en": {"text": "Share my code", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#0891B2", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#0891B2", "textColor": "#333333", "buttonColor": "#0891B2", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- CATEGORY: RAMADAN - Special Ramadan Content
-- 10. Ramadan Announcement
('Ramadan Approche', 'Annonce de l''approche du Ramadan', 'ramadan', 'all',
 '🌙 Ramadan approche : Préparez vos soirées iftar !', '🌙 Ramadan is coming: Prepare your iftar evenings!',
 'Découvrez nos offres spéciales Ramadan', 'Discover our special Ramadan offers',
 '[
   {"type": "header", "content_fr": {"title": "🌙 Ramadan Mubarak", "subtitle": "Préparez vos soirées iftar"}, "content_en": {"title": "🌙 Ramadan Mubarak", "subtitle": "Prepare your iftar evenings"}, "settings": {"backgroundColor": "#1E3A5F", "textColor": "#D4AF37"}},
   {"type": "image", "content_fr": {"url": "{{ramadan_hero}}", "alt": "Ramadan"}, "content_en": {"url": "{{ramadan_hero}}", "alt": "Ramadan"}, "settings": {"fullWidth": true}},
   {"type": "text", "content_fr": {"html": "<p>Cher(e) {{first_name}},</p><p>Le mois sacré de Ramadan approche à grands pas. Sortir Au Maroc vous accompagne pour vivre des moments inoubliables en famille et entre amis.</p><p><strong>Nos offres spéciales Ramadan :</strong></p>"}, "content_en": {"html": "<p>Dear {{first_name}},</p><p>The holy month of Ramadan is fast approaching. Sortir Au Maroc accompanies you to experience unforgettable moments with family and friends.</p><p><strong>Our special Ramadan offers:</strong></p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "🍽️", "title": "Iftars", "text": "Les meilleurs restaurants"}, {"icon": "🏨", "title": "Séjours", "text": "Offres famille spéciales"}, {"icon": "🌟", "title": "Animations", "text": "Soirées traditionnelles"}]}, "content_en": {"columns": [{"icon": "🍽️", "title": "Iftars", "text": "The best restaurants"}, {"icon": "🏨", "title": "Stays", "text": "Special family offers"}, {"icon": "🌟", "title": "Entertainment", "text": "Traditional evenings"}]}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Découvrir les offres Ramadan", "url": "{{cta_url}}"}, "content_en": {"text": "Discover Ramadan offers", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#D4AF37", "textColor": "#1E3A5F", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#F8F6F0", "fontFamily": "Georgia, serif", "headerColor": "#1E3A5F", "textColor": "#333333", "buttonColor": "#D4AF37", "buttonTextColor": "#1E3A5F"}'::jsonb,
 true),

-- 11. Ramadan Restaurant Guide
('Guide Restaurants Ramadan', 'Liste des meilleurs restaurants pour le Ramadan', 'ramadan', 'users',
 '🍽️ Top 10 des restaurants pour vos iftars', '🍽️ Top 10 restaurants for your iftars',
 'Notre sélection des meilleures adresses pour le Ramadan', 'Our selection of the best addresses for Ramadan',
 '[
   {"type": "header", "content_fr": {"title": "Guide Iftar 2026", "subtitle": "Les meilleures adresses"}, "content_en": {"title": "Iftar Guide 2026", "subtitle": "The best addresses"}, "settings": {"backgroundColor": "#7C3AED", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Découvrez notre sélection des <strong>10 meilleurs restaurants</strong> pour vos soirées iftar cette année.</p>"}, "content_en": {"html": "<p>Discover our selection of the <strong>10 best restaurants</strong> for your iftar evenings this year.</p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["🥇 {{restaurant_1}} - Casablanca", "🥈 {{restaurant_2}} - Marrakech", "🥉 {{restaurant_3}} - Rabat", "4. {{restaurant_4}} - Tanger", "5. {{restaurant_5}} - Fès"]}, "content_en": {"items": ["🥇 {{restaurant_1}} - Casablanca", "🥈 {{restaurant_2}} - Marrakech", "🥉 {{restaurant_3}} - Rabat", "4. {{restaurant_4}} - Tangier", "5. {{restaurant_5}} - Fes"]}, "settings": {"style": "none"}},
   {"type": "button", "content_fr": {"text": "Voir le classement complet", "url": "{{cta_url}}"}, "content_en": {"text": "See complete ranking", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#7C3AED", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#7C3AED", "textColor": "#333333", "buttonColor": "#7C3AED", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 12. Ramadan Family Package
('Offre Famille Ramadan', 'Package familial spécial Ramadan', 'ramadan', 'users',
 '👨‍👩‍👧‍👦 Offre Famille Ramadan : Séjour + Iftars inclus', '👨‍👩‍👧‍👦 Ramadan Family Offer: Stay + Iftars included',
 'Passez le Ramadan en famille dans un cadre exceptionnel', 'Spend Ramadan with family in an exceptional setting',
 '[
   {"type": "header", "content_fr": {"title": "Offre Famille Ramadan", "subtitle": "Séjour tout compris"}, "content_en": {"title": "Ramadan Family Offer", "subtitle": "All-inclusive stay"}, "settings": {"backgroundColor": "#DC2626", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{family_image}}", "alt": "Famille"}, "content_en": {"url": "{{family_image}}", "alt": "Family"}, "settings": {"fullWidth": true}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center; font-size: 24px;\"><strong>À partir de {{price}} MAD</strong><br/><span style=\"font-size: 14px; color: #666;\">pour 2 adultes + 2 enfants</span></p>"}, "content_en": {"html": "<p style=\"text-align: center; font-size: 24px;\"><strong>Starting from {{price}} MAD</strong><br/><span style=\"font-size: 14px; color: #666;\">for 2 adults + 2 children</span></p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["2 nuits en chambre familiale", "Iftars buffet inclus", "Shours servis en chambre", "Animation pour enfants", "Accès spa pour les parents"]}, "content_en": {"items": ["2 nights in family room", "Buffet iftars included", "Shoor served in room", "Kids entertainment", "Spa access for parents"]}, "settings": {"style": "check"}},
   {"type": "button", "content_fr": {"text": "Réserver maintenant", "url": "{{cta_url}}"}, "content_en": {"text": "Book now", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#DC2626", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FEF2F2", "fontFamily": "Arial, sans-serif", "headerColor": "#DC2626", "textColor": "#333333", "buttonColor": "#DC2626", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 13. Ramadan Last Minute
('Dernière Minute Ramadan', 'Offres de dernière minute pour le Ramadan', 'ramadan', 'users',
 '⏰ Dernière minute : Places disponibles pour l''iftar de ce soir !', '⏰ Last minute: Places available for tonight''s iftar!',
 'Réservez vite, places limitées', 'Book fast, limited places',
 '[
   {"type": "header", "content_fr": {"title": "⏰ Dernière Minute", "subtitle": "Places encore disponibles ce soir"}, "content_en": {"title": "⏰ Last Minute", "subtitle": "Places still available tonight"}, "settings": {"backgroundColor": "#EA580C", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Bonne nouvelle ! Quelques places viennent de se libérer pour l''iftar de <strong>ce soir</strong> dans ces établissements :</p>"}, "content_en": {"html": "<p>Good news! Some places have just become available for <strong>tonight''s</strong> iftar at these establishments:</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "🍽️", "title": "{{restaurant_a}}", "text": "3 places - {{time_a}}"}, {"icon": "🍽️", "title": "{{restaurant_b}}", "text": "2 places - {{time_b}}"}]}, "content_en": {"columns": [{"icon": "🍽️", "title": "{{restaurant_a}}", "text": "3 places - {{time_a}}"}, {"icon": "🍽️", "title": "{{restaurant_b}}", "text": "2 places - {{time_b}}"}]}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Réserver maintenant", "url": "{{cta_url}}"}, "content_en": {"text": "Book now", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#EA580C", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#EA580C", "textColor": "#333333", "buttonColor": "#EA580C", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 14. Eid Celebration
('Célébration Aïd', 'Newsletter pour l''Aïd al-Fitr', 'ramadan', 'all',
 '🎉 Aïd Mubarak ! Célébrez avec Sortir Au Maroc', '🎉 Eid Mubarak! Celebrate with Sortir Au Maroc',
 'Offres spéciales pour fêter l''Aïd', 'Special offers to celebrate Eid',
 '[
   {"type": "header", "content_fr": {"title": "🎉 Aïd Mubarak 🎉", "subtitle": "Que cette fête soit bénie"}, "content_en": {"title": "🎉 Eid Mubarak 🎉", "subtitle": "May this celebration be blessed"}, "settings": {"backgroundColor": "#065F46", "textColor": "#D4AF37"}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center; font-size: 18px;\">Toute l''équipe Sortir Au Maroc vous souhaite un joyeux Aïd al-Fitr !</p><p style=\"text-align: center;\">Pour célébrer cette fête, profitez de nos offres spéciales.</p>"}, "content_en": {"html": "<p style=\"text-align: center; font-size: 18px;\">The entire Sortir Au Maroc team wishes you a happy Eid al-Fitr!</p><p style=\"text-align: center;\">To celebrate this holiday, enjoy our special offers.</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "🍰", "title": "Brunchs", "text": "-20% ce week-end"}, {"icon": "🏨", "title": "Séjours", "text": "3ème nuit offerte"}, {"icon": "🎁", "title": "Activités", "text": "Enfants gratuits"}]}, "content_en": {"columns": [{"icon": "🍰", "title": "Brunches", "text": "-20% this weekend"}, {"icon": "🏨", "title": "Stays", "text": "3rd night free"}, {"icon": "🎁", "title": "Activities", "text": "Kids free"}]}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Voir toutes les offres", "url": "{{cta_url}}"}, "content_en": {"text": "See all offers", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#D4AF37", "textColor": "#065F46", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#ECFDF5", "fontFamily": "Georgia, serif", "headerColor": "#065F46", "textColor": "#333333", "buttonColor": "#D4AF37", "buttonTextColor": "#065F46"}'::jsonb,
 true),

-- CATEGORY: SEASONAL - Seasonal Events
-- 15. Summer Campaign
('Été Marocain', 'Campagne été avec activités et plages', 'seasonal', 'all',
 '☀️ L''été marocain commence ! Découvrez nos destinations', '☀️ Moroccan summer begins! Discover our destinations',
 'Plages, piscines, activités... Tout pour un été parfait', 'Beaches, pools, activities... Everything for a perfect summer',
 '[
   {"type": "header", "content_fr": {"title": "☀️ L''Été Est Là", "subtitle": "Vivez des moments inoubliables"}, "content_en": {"title": "☀️ Summer Is Here", "subtitle": "Live unforgettable moments"}, "settings": {"backgroundColor": "#0284C7", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{summer_hero}}", "alt": "Été au Maroc"}, "content_en": {"url": "{{summer_hero}}", "alt": "Summer in Morocco"}, "settings": {"fullWidth": true}},
   {"type": "text", "content_fr": {"html": "<p>Cet été, laissez-vous tenter par nos plus belles destinations et activités !</p>"}, "content_en": {"html": "<p>This summer, let yourself be tempted by our most beautiful destinations and activities!</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "🏖️", "title": "Plages", "text": "Agadir, Essaouira, Dakhla"}, {"icon": "🏔️", "title": "Montagne", "text": "Atlas, Ifrane, Chefchaouen"}, {"icon": "🏜️", "title": "Désert", "text": "Merzouga, Zagora"}]}, "content_en": {"columns": [{"icon": "🏖️", "title": "Beaches", "text": "Agadir, Essaouira, Dakhla"}, {"icon": "🏔️", "title": "Mountains", "text": "Atlas, Ifrane, Chefchaouen"}, {"icon": "🏜️", "title": "Desert", "text": "Merzouga, Zagora"}]}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Explorer les destinations", "url": "{{cta_url}}"}, "content_en": {"text": "Explore destinations", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#F59E0B", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#F0F9FF", "fontFamily": "Arial, sans-serif", "headerColor": "#0284C7", "textColor": "#333333", "buttonColor": "#F59E0B", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 16. Winter Escapes
('Escapades Hivernales', 'Offres hiver et stations de ski', 'seasonal', 'users',
 '❄️ Escapades hivernales : Ski, montagne et bien-être', '❄️ Winter escapes: Ski, mountains and wellness',
 'Profitez de l''hiver marocain', 'Enjoy the Moroccan winter',
 '[
   {"type": "header", "content_fr": {"title": "❄️ Escapades Hivernales", "subtitle": "L''hiver au Maroc"}, "content_en": {"title": "❄️ Winter Escapes", "subtitle": "Winter in Morocco"}, "settings": {"backgroundColor": "#1E40AF", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{winter_hero}}", "alt": "Hiver au Maroc"}, "content_en": {"url": "{{winter_hero}}", "alt": "Winter in Morocco"}, "settings": {"fullWidth": true}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "⛷️", "title": "Oukaimeden", "text": "Station de ski"}, {"icon": "🏔️", "title": "Ifrane", "text": "La petite Suisse"}, {"icon": "💆", "title": "Spas", "text": "Détente & Hammams"}]}, "content_en": {"columns": [{"icon": "⛷️", "title": "Oukaimeden", "text": "Ski resort"}, {"icon": "🏔️", "title": "Ifrane", "text": "Little Switzerland"}, {"icon": "💆", "title": "Spas", "text": "Relaxation & Hammams"}]}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Réserver mon escapade", "url": "{{cta_url}}"}, "content_en": {"text": "Book my escape", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#3B82F6", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#EFF6FF", "fontFamily": "Arial, sans-serif", "headerColor": "#1E40AF", "textColor": "#333333", "buttonColor": "#3B82F6", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 17. Valentine's Day
('Saint Valentin', 'Offres spéciales Saint Valentin', 'seasonal', 'users',
 '💕 Saint Valentin : Offrez une expérience inoubliable', '💕 Valentine''s Day: Give an unforgettable experience',
 'Dîners romantiques, séjours en amoureux...', 'Romantic dinners, couples getaways...',
 '[
   {"type": "header", "content_fr": {"title": "💕 Saint Valentin", "subtitle": "Célébrez l''amour"}, "content_en": {"title": "💕 Valentine''s Day", "subtitle": "Celebrate love"}, "settings": {"backgroundColor": "#BE185D", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{valentine_hero}}", "alt": "Saint Valentin"}, "content_en": {"url": "{{valentine_hero}}", "alt": "Valentine''s Day"}, "settings": {"fullWidth": true}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center;\">Surprenez votre moitié avec une expérience exceptionnelle</p>"}, "content_en": {"html": "<p style=\"text-align: center;\">Surprise your other half with an exceptional experience</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "🍷", "title": "Dîners", "text": "Restaurants romantiques"}, {"icon": "🌹", "title": "Séjours", "text": "Riads & Hôtels de charme"}, {"icon": "💆‍♀️", "title": "Spa Duo", "text": "Massages en couple"}]}, "content_en": {"columns": [{"icon": "🍷", "title": "Dinners", "text": "Romantic restaurants"}, {"icon": "🌹", "title": "Stays", "text": "Riads & Boutique Hotels"}, {"icon": "💆‍♀️", "title": "Duo Spa", "text": "Couples massages"}]}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Voir les offres", "url": "{{cta_url}}"}, "content_en": {"text": "See offers", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#EC4899", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FDF2F8", "fontFamily": "Georgia, serif", "headerColor": "#BE185D", "textColor": "#333333", "buttonColor": "#EC4899", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 18. New Year
('Nouvel An', 'Célébrations du Nouvel An', 'seasonal', 'all',
 '🎆 Nouvel An 2026 : Les meilleures soirées au Maroc !', '🎆 New Year 2026: The best parties in Morocco!',
 'Réservez votre réveillon maintenant', 'Book your New Year''s Eve now',
 '[
   {"type": "header", "content_fr": {"title": "🎆 Nouvel An 2026", "subtitle": "Célébrez en grand !"}, "content_en": {"title": "🎆 New Year 2026", "subtitle": "Celebrate big!"}, "settings": {"backgroundColor": "#1F2937", "textColor": "#F59E0B"}},
   {"type": "countdown", "content_fr": {"endDate": "2026-01-01T00:00:00", "text": "Compte à rebours"}, "content_en": {"endDate": "2026-01-01T00:00:00", "text": "Countdown"}, "settings": {"backgroundColor": "#F59E0B", "textColor": "#1F2937"}},
   {"type": "text", "content_fr": {"html": "<p>Les meilleures soirées du Nouvel An au Maroc vous attendent !</p>"}, "content_en": {"html": "<p>The best New Year''s Eve parties in Morocco await you!</p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["Dîners de gala dans des hôtels 5*", "Soirées DJ & animations", "Feux d''artifice", "Brunchs du 1er janvier"]}, "content_en": {"items": ["Gala dinners in 5* hotels", "DJ parties & entertainment", "Fireworks", "January 1st brunches"]}, "settings": {"style": "star"}},
   {"type": "button", "content_fr": {"text": "Réserver mon réveillon", "url": "{{cta_url}}"}, "content_en": {"text": "Book my New Year''s Eve", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#F59E0B", "textColor": "#1F2937", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#1F2937", "fontFamily": "Arial, sans-serif", "headerColor": "#F59E0B", "textColor": "#F3F4F6", "buttonColor": "#F59E0B", "buttonTextColor": "#1F2937"}'::jsonb,
 true),

-- CATEGORY: EVENTS - Special Events
-- 19. Festival Announcement
('Annonce Festival', 'Annonce d''un festival ou événement', 'events', 'all',
 '🎵 Festival {{festival_name}} : Réservez vos places !', '🎵 {{festival_name}} Festival: Book your tickets!',
 'L''événement incontournable de l''année', 'The must-attend event of the year',
 '[
   {"type": "header", "content_fr": {"title": "{{festival_name}}", "subtitle": "{{festival_dates}}"}, "content_en": {"title": "{{festival_name}}", "subtitle": "{{festival_dates}}"}, "settings": {"backgroundColor": "#7C3AED", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{festival_image}}", "alt": "{{festival_name}}"}, "content_en": {"url": "{{festival_image}}", "alt": "{{festival_name}}"}, "settings": {"fullWidth": true}},
   {"type": "text", "content_fr": {"html": "<p>Le {{festival_name}} revient pour une nouvelle édition exceptionnelle !</p><p><strong>Line-up :</strong></p>"}, "content_en": {"html": "<p>The {{festival_name}} is back for a new exceptional edition!</p><p><strong>Line-up:</strong></p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["{{artist_1}}", "{{artist_2}}", "{{artist_3}}", "Et bien plus encore..."]}, "content_en": {"items": ["{{artist_1}}", "{{artist_2}}", "{{artist_3}}", "And much more..."]}, "settings": {"style": "star"}},
   {"type": "button", "content_fr": {"text": "Réserver mes places", "url": "{{cta_url}}"}, "content_en": {"text": "Book my tickets", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#7C3AED", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#7C3AED", "textColor": "#333333", "buttonColor": "#7C3AED", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 20. Pop-up Event
('Événement Pop-up', 'Événement éphémère ou pop-up', 'events', 'users',
 '📍 Nouveau : {{event_name}} - Événement éphémère', '📍 New: {{event_name}} - Pop-up event',
 'Ne manquez pas cet événement unique', 'Don''t miss this unique event',
 '[
   {"type": "header", "content_fr": {"title": "{{event_name}}", "subtitle": "Événement Éphémère"}, "content_en": {"title": "{{event_name}}", "subtitle": "Pop-up Event"}, "settings": {"backgroundColor": "#0D9488", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Pour une durée limitée, découvrez <strong>{{event_name}}</strong> !</p><p>📅 Du {{start_date}} au {{end_date}}<br/>📍 {{location}}</p>"}, "content_en": {"html": "<p>For a limited time, discover <strong>{{event_name}}</strong>!</p><p>📅 From {{start_date}} to {{end_date}}<br/>📍 {{location}}</p>"}, "settings": {}},
   {"type": "image", "content_fr": {"url": "{{event_image}}", "alt": "{{event_name}}"}, "content_en": {"url": "{{event_image}}", "alt": "{{event_name}}"}, "settings": {"borderRadius": "8px"}},
   {"type": "button", "content_fr": {"text": "Réserver ma place", "url": "{{cta_url}}"}, "content_en": {"text": "Book my spot", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#0D9488", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#F0FDFA", "fontFamily": "Arial, sans-serif", "headerColor": "#0D9488", "textColor": "#333333", "buttonColor": "#0D9488", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- CATEGORY: PROS - Professional Templates
-- 21. New Partner Welcome
('Bienvenue Nouveau Partenaire', 'Bienvenue aux nouveaux établissements partenaires', 'pros', 'pros',
 'Bienvenue dans la famille Sortir Au Maroc !', 'Welcome to the Sortir Au Maroc family!',
 'Tout ce que vous devez savoir pour commencer', 'Everything you need to know to get started',
 '[
   {"type": "header", "content_fr": {"title": "Bienvenue !", "subtitle": "Vous êtes maintenant partenaire"}, "content_en": {"title": "Welcome!", "subtitle": "You are now a partner"}, "settings": {"backgroundColor": "#2C5530", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Cher partenaire,</p><p>Nous sommes ravis de vous accueillir dans notre réseau ! Voici les prochaines étapes pour commencer :</p>"}, "content_en": {"html": "<p>Dear partner,</p><p>We are delighted to welcome you to our network! Here are the next steps to get started:</p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["Complétez votre profil établissement", "Ajoutez vos photos et menus", "Configurez vos disponibilités", "Activez vos notifications"]}, "content_en": {"items": ["Complete your establishment profile", "Add your photos and menus", "Configure your availability", "Enable your notifications"]}, "settings": {"style": "number"}},
   {"type": "button", "content_fr": {"text": "Accéder à mon espace Pro", "url": "{{cta_url}}"}, "content_en": {"text": "Access my Pro space", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#2C5530", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#F0FDF4", "fontFamily": "Arial, sans-serif", "headerColor": "#2C5530", "textColor": "#333333", "buttonColor": "#2C5530", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 22. Monthly Performance Report
('Rapport Mensuel Pro', 'Rapport de performance mensuel pour les pros', 'pros', 'pros',
 '📊 Votre rapport mensuel - {{month}} {{year}}', '📊 Your monthly report - {{month}} {{year}}',
 'Découvrez vos statistiques du mois', 'Discover your monthly stats',
 '[
   {"type": "header", "content_fr": {"title": "Rapport Mensuel", "subtitle": "{{month}} {{year}}"}, "content_en": {"title": "Monthly Report", "subtitle": "{{month}} {{year}}"}, "settings": {"backgroundColor": "#1E40AF", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Bonjour {{establishment_name}},</p><p>Voici le résumé de votre activité ce mois-ci :</p>"}, "content_en": {"html": "<p>Hello {{establishment_name}},</p><p>Here is the summary of your activity this month:</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "📅", "title": "{{reservations_count}}", "text": "Réservations"}, {"icon": "💰", "title": "{{revenue}} MAD", "text": "Chiffre d''affaires"}, {"icon": "⭐", "title": "{{rating}}/5", "text": "Note moyenne"}]}, "content_en": {"columns": [{"icon": "📅", "title": "{{reservations_count}}", "text": "Reservations"}, {"icon": "💰", "title": "{{revenue}} MAD", "text": "Revenue"}, {"icon": "⭐", "title": "{{rating}}/5", "text": "Average rating"}]}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<p><strong>Évolution vs mois précédent :</strong> {{evolution}}</p>"}, "content_en": {"html": "<p><strong>Change vs previous month:</strong> {{evolution}}</p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Voir le rapport complet", "url": "{{cta_url}}"}, "content_en": {"text": "See full report", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#1E40AF", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#EFF6FF", "fontFamily": "Arial, sans-serif", "headerColor": "#1E40AF", "textColor": "#333333", "buttonColor": "#1E40AF", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 23. Pro Tips & Best Practices
('Conseils Pro', 'Conseils et bonnes pratiques pour les pros', 'pros', 'pros',
 '💡 Conseils Pro : Optimisez votre visibilité', '💡 Pro Tips: Optimize your visibility',
 'Astuces pour augmenter vos réservations', 'Tips to increase your bookings',
 '[
   {"type": "header", "content_fr": {"title": "💡 Conseils Pro", "subtitle": "Optimisez votre succès"}, "content_en": {"title": "💡 Pro Tips", "subtitle": "Optimize your success"}, "settings": {"backgroundColor": "#7C2D12", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Cette semaine, découvrez nos conseils pour améliorer votre visibilité et augmenter vos réservations.</p><p><strong>Conseil #{{tip_number}} : {{tip_title}}</strong></p>"}, "content_en": {"html": "<p>This week, discover our tips to improve your visibility and increase your bookings.</p><p><strong>Tip #{{tip_number}}: {{tip_title}}</strong></p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["{{tip_1}}", "{{tip_2}}", "{{tip_3}}"]}, "content_en": {"items": ["{{tip_1_en}}", "{{tip_2_en}}", "{{tip_3_en}}"]}, "settings": {"style": "check"}},
   {"type": "button", "content_fr": {"text": "Appliquer maintenant", "url": "{{cta_url}}"}, "content_en": {"text": "Apply now", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#EA580C", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFF7ED", "fontFamily": "Arial, sans-serif", "headerColor": "#7C2D12", "textColor": "#333333", "buttonColor": "#EA580C", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 24. Pro New Feature Announcement
('Nouvelle Fonctionnalité Pro', 'Annonce d''une nouvelle fonctionnalité pour les pros', 'pros', 'pros',
 '🚀 Nouveau : {{feature_name}} est disponible !', '🚀 New: {{feature_name}} is now available!',
 'Découvrez notre dernière fonctionnalité', 'Discover our latest feature',
 '[
   {"type": "header", "content_fr": {"title": "🚀 Nouveauté", "subtitle": "{{feature_name}}"}, "content_en": {"title": "🚀 New Feature", "subtitle": "{{feature_name}}"}, "settings": {"backgroundColor": "#4F46E5", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{feature_image}}", "alt": "{{feature_name}}"}, "content_en": {"url": "{{feature_image}}", "alt": "{{feature_name}}"}, "settings": {"borderRadius": "8px"}},
   {"type": "text", "content_fr": {"html": "<p>Nous sommes ravis de vous présenter <strong>{{feature_name}}</strong>, notre nouvelle fonctionnalité conçue pour vous simplifier la vie !</p><p><strong>Avantages :</strong></p>"}, "content_en": {"html": "<p>We are pleased to introduce <strong>{{feature_name}}</strong>, our new feature designed to make your life easier!</p><p><strong>Benefits:</strong></p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["{{benefit_1}}", "{{benefit_2}}", "{{benefit_3}}"]}, "content_en": {"items": ["{{benefit_1_en}}", "{{benefit_2_en}}", "{{benefit_3_en}}"]}, "settings": {"style": "check"}},
   {"type": "button", "content_fr": {"text": "Essayer maintenant", "url": "{{cta_url}}"}, "content_en": {"text": "Try now", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#4F46E5", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#EEF2FF", "fontFamily": "Arial, sans-serif", "headerColor": "#4F46E5", "textColor": "#333333", "buttonColor": "#4F46E5", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- CATEGORY: USERS - User Engagement
-- 25. Welcome New User
('Bienvenue Nouvel Utilisateur', 'Email de bienvenue pour les nouveaux utilisateurs', 'users', 'users',
 'Bienvenue {{first_name}} ! Votre aventure Sortir Au Maroc commence', 'Welcome {{first_name}}! Your Sortir Au Maroc adventure begins',
 'Découvrez tout ce que vous pouvez faire', 'Discover everything you can do',
 '[
   {"type": "header", "content_fr": {"title": "Bienvenue {{first_name}} !", "subtitle": "Votre aventure commence"}, "content_en": {"title": "Welcome {{first_name}}!", "subtitle": "Your adventure begins"}, "settings": {"backgroundColor": "#D4AF37", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Nous sommes ravis de vous compter parmi nous ! Sortir Au Maroc vous ouvre les portes des meilleures expériences au Maroc.</p><p><strong>Que pouvez-vous faire ?</strong></p>"}, "content_en": {"html": "<p>We are delighted to have you with us! Sortir Au Maroc opens the doors to the best experiences in Morocco.</p><p><strong>What can you do?</strong></p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "🍽️", "title": "Réserver", "text": "Tables dans les meilleurs restaurants"}, {"icon": "🏨", "title": "Séjourner", "text": "Hôtels & riads d''exception"}, {"icon": "🎉", "title": "Découvrir", "text": "Activités & événements"}]}, "content_en": {"columns": [{"icon": "🍽️", "title": "Book", "text": "Tables at the best restaurants"}, {"icon": "🏨", "title": "Stay", "text": "Exceptional hotels & riads"}, {"icon": "🎉", "title": "Discover", "text": "Activities & events"}]}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<p style=\"background: #FEF3C7; padding: 15px; border-radius: 8px; text-align: center;\"><strong>🎁 Cadeau de bienvenue</strong><br/>Utilisez le code <strong>BIENVENUE10</strong> pour -10% sur votre première réservation !</p>"}, "content_en": {"html": "<p style=\"background: #FEF3C7; padding: 15px; border-radius: 8px; text-align: center;\"><strong>🎁 Welcome gift</strong><br/>Use code <strong>WELCOME10</strong> for -10% on your first booking!</p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Commencer à explorer", "url": "{{cta_url}}"}, "content_en": {"text": "Start exploring", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#D4AF37", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#D4AF37", "textColor": "#333333", "buttonColor": "#D4AF37", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 26. Re-engagement Campaign
('Réengagement Utilisateur', 'Campagne pour réactiver les utilisateurs inactifs', 'users', 'users',
 '{{first_name}}, vous nous manquez ! Revenez avec -20%', '{{first_name}}, we miss you! Come back with -20%',
 'Offre spéciale pour votre retour', 'Special offer for your return',
 '[
   {"type": "header", "content_fr": {"title": "Vous nous manquez !", "subtitle": "{{first_name}}, revenez nous voir"}, "content_en": {"title": "We miss you!", "subtitle": "{{first_name}}, come back to see us"}, "settings": {"backgroundColor": "#9333EA", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Cela fait un moment que nous ne vous avons pas vu sur Sortir Au Maroc. Des tas de nouvelles expériences vous attendent !</p><p style=\"text-align: center; font-size: 24px; color: #9333EA;\"><strong>-20% sur votre prochaine réservation</strong></p>"}, "content_en": {"html": "<p>It''s been a while since we''ve seen you on Sortir Au Maroc. Lots of new experiences await you!</p><p style=\"text-align: center; font-size: 24px; color: #9333EA;\"><strong>-20% on your next booking</strong></p>"}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<div style=\"background: #F5F3FF; padding: 20px; text-align: center; border-radius: 8px;\"><p style=\"margin: 0; font-size: 12px; color: #666;\">Votre code de retour</p><p style=\"margin: 10px 0 0; font-size: 28px; font-weight: bold; letter-spacing: 3px;\">COMEBACK20</p></div>"}, "content_en": {"html": "<div style=\"background: #F5F3FF; padding: 20px; text-align: center; border-radius: 8px;\"><p style=\"margin: 0; font-size: 12px; color: #666;\">Your comeback code</p><p style=\"margin: 10px 0 0; font-size: 28px; font-weight: bold; letter-spacing: 3px;\">COMEBACK20</p></div>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Utiliser mon code", "url": "{{cta_url}}"}, "content_en": {"text": "Use my code", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#9333EA", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FFFFFF", "fontFamily": "Arial, sans-serif", "headerColor": "#9333EA", "textColor": "#333333", "buttonColor": "#9333EA", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 27. Birthday Campaign
('Anniversaire Utilisateur', 'Souhait d''anniversaire avec offre spéciale', 'users', 'users',
 '🎂 Joyeux anniversaire {{first_name}} ! Un cadeau vous attend', '🎂 Happy birthday {{first_name}}! A gift awaits you',
 'Votre cadeau d''anniversaire de la part de Sortir Au Maroc', 'Your birthday gift from Sortir Au Maroc',
 '[
   {"type": "header", "content_fr": {"title": "🎂 Joyeux Anniversaire !", "subtitle": "{{first_name}}"}, "content_en": {"title": "🎂 Happy Birthday!", "subtitle": "{{first_name}}"}, "settings": {"backgroundColor": "#EC4899", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center; font-size: 18px;\">Toute l''équipe Sortir Au Maroc vous souhaite un merveilleux anniversaire !</p><p style=\"text-align: center;\">Pour cette occasion spéciale, nous vous offrons un cadeau :</p>"}, "content_en": {"html": "<p style=\"text-align: center; font-size: 18px;\">The entire Sortir Au Maroc team wishes you a wonderful birthday!</p><p style=\"text-align: center;\">For this special occasion, we offer you a gift:</p>"}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<div style=\"background: linear-gradient(135deg, #EC4899, #F472B6); padding: 30px; text-align: center; border-radius: 12px; color: white;\"><p style=\"margin: 0; font-size: 14px;\">Votre cadeau</p><p style=\"margin: 10px 0; font-size: 36px; font-weight: bold;\">-25%</p><p style=\"margin: 0;\">sur votre prochaine réservation</p></div>"}, "content_en": {"html": "<div style=\"background: linear-gradient(135deg, #EC4899, #F472B6); padding: 30px; text-align: center; border-radius: 12px; color: white;\"><p style=\"margin: 0; font-size: 14px;\">Your gift</p><p style=\"margin: 10px 0; font-size: 36px; font-weight: bold;\">-25%</p><p style=\"margin: 0;\">on your next booking</p></div>"}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center;\">Code : <strong>BIRTHDAY25</strong><br/><span style=\"font-size: 12px; color: #666;\">Valable 30 jours</span></p>"}, "content_en": {"html": "<p style=\"text-align: center;\">Code: <strong>BIRTHDAY25</strong><br/><span style=\"font-size: 12px; color: #666;\">Valid 30 days</span></p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Célébrer maintenant", "url": "{{cta_url}}"}, "content_en": {"text": "Celebrate now", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#EC4899", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FDF2F8", "fontFamily": "Arial, sans-serif", "headerColor": "#EC4899", "textColor": "#333333", "buttonColor": "#EC4899", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 28. Weekly Recommendations
('Recommandations Hebdo', 'Recommandations personnalisées hebdomadaires', 'users', 'users',
 '✨ {{first_name}}, vos recommandations de la semaine', '✨ {{first_name}}, your weekly recommendations',
 'Sélection personnalisée rien que pour vous', 'Personalized selection just for you',
 '[
   {"type": "header", "content_fr": {"title": "Vos Recommandations", "subtitle": "Sélection personnalisée"}, "content_en": {"title": "Your Recommendations", "subtitle": "Personalized selection"}, "settings": {"backgroundColor": "#0F766E", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>{{first_name}}, voici notre sélection rien que pour vous cette semaine :</p>"}, "content_en": {"html": "<p>{{first_name}}, here is our selection just for you this week:</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"image": "{{reco_1_image}}", "title": "{{reco_1_name}}", "text": "{{reco_1_type}}"}, {"image": "{{reco_2_image}}", "title": "{{reco_2_name}}", "text": "{{reco_2_type}}"}, {"image": "{{reco_3_image}}", "title": "{{reco_3_name}}", "text": "{{reco_3_type}}"}]}, "content_en": {"columns": [{"image": "{{reco_1_image}}", "title": "{{reco_1_name}}", "text": "{{reco_1_type}}"}, {"image": "{{reco_2_image}}", "title": "{{reco_2_name}}", "text": "{{reco_2_type}}"}, {"image": "{{reco_3_image}}", "title": "{{reco_3_name}}", "text": "{{reco_3_type}}"}]}, "settings": {"imageStyle": "rounded"}},
   {"type": "button", "content_fr": {"text": "Voir toutes les recommandations", "url": "{{cta_url}}"}, "content_en": {"text": "See all recommendations", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#0F766E", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#F0FDFA", "fontFamily": "Arial, sans-serif", "headerColor": "#0F766E", "textColor": "#333333", "buttonColor": "#0F766E", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 29. Review Request
('Demande Avis', 'Demande d''avis après une réservation', 'users', 'users',
 '⭐ {{first_name}}, donnez votre avis sur {{establishment_name}}', '⭐ {{first_name}}, share your review of {{establishment_name}}',
 'Votre expérience compte pour nous', 'Your experience matters to us',
 '[
   {"type": "header", "content_fr": {"title": "Votre avis compte", "subtitle": "Partagez votre expérience"}, "content_en": {"title": "Your opinion matters", "subtitle": "Share your experience"}, "settings": {"backgroundColor": "#CA8A04", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>{{first_name}},</p><p>Nous espérons que vous avez passé un excellent moment chez <strong>{{establishment_name}}</strong> !</p><p>Votre avis nous aide à améliorer nos services et guide les autres utilisateurs. Cela ne prend que 2 minutes :</p>"}, "content_en": {"html": "<p>{{first_name}},</p><p>We hope you had a great time at <strong>{{establishment_name}}</strong>!</p><p>Your review helps us improve our services and guides other users. It only takes 2 minutes:</p>"}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center; font-size: 36px;\">⭐⭐⭐⭐⭐</p>"}, "content_en": {"html": "<p style=\"text-align: center; font-size: 36px;\">⭐⭐⭐⭐⭐</p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Donner mon avis", "url": "{{cta_url}}"}, "content_en": {"text": "Leave my review", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#CA8A04", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FEFCE8", "fontFamily": "Arial, sans-serif", "headerColor": "#CA8A04", "textColor": "#333333", "buttonColor": "#CA8A04", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 30. Survey/Feedback Request
('Enquête Satisfaction', 'Enquête de satisfaction utilisateur', 'users', 'all',
 '📋 Votre avis nous intéresse ! Participez à notre enquête', '📋 We value your opinion! Take our survey',
 '5 minutes pour nous aider à nous améliorer', '5 minutes to help us improve',
 '[
   {"type": "header", "content_fr": {"title": "📋 Enquête de Satisfaction", "subtitle": "Aidez-nous à nous améliorer"}, "content_en": {"title": "📋 Satisfaction Survey", "subtitle": "Help us improve"}, "settings": {"backgroundColor": "#2563EB", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Cher(e) {{first_name}},</p><p>Votre avis est précieux pour nous ! Prenez 5 minutes pour répondre à notre enquête et aidez-nous à améliorer Sortir Au Maroc.</p>"}, "content_en": {"html": "<p>Dear {{first_name}},</p><p>Your feedback is valuable to us! Take 5 minutes to answer our survey and help us improve Sortir Au Maroc.</p>"}, "settings": {}},
   {"type": "poll", "content_fr": {"question": "Comment évaluez-vous votre expérience ?", "options": ["Excellente", "Bonne", "Moyenne", "À améliorer"]}, "content_en": {"question": "How would you rate your experience?", "options": ["Excellent", "Good", "Average", "Needs improvement"]}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center; background: #DBEAFE; padding: 15px; border-radius: 8px;\"><strong>🎁 En remerciement</strong><br/>Recevez un bon de 50 MAD après avoir complété l''enquête !</p>"}, "content_en": {"html": "<p style=\"text-align: center; background: #DBEAFE; padding: 15px; border-radius: 8px;\"><strong>🎁 As a thank you</strong><br/>Receive a 50 MAD voucher after completing the survey!</p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Participer à l''enquête", "url": "{{cta_url}}"}, "content_en": {"text": "Take the survey", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#2563EB", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#EFF6FF", "fontFamily": "Arial, sans-serif", "headerColor": "#2563EB", "textColor": "#333333", "buttonColor": "#2563EB", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- CATEGORY: GENERAL - Miscellaneous Templates
-- 31. Platform Update
('Mise à jour Plateforme', 'Annonce de mise à jour de la plateforme', 'general', 'all',
 '🔧 Nouveautés Sortir Au Maroc : Découvrez les dernières améliorations', '🔧 Sortir Au Maroc Updates: Discover the latest improvements',
 'De nouvelles fonctionnalités pour une meilleure expérience', 'New features for a better experience',
 '[
   {"type": "header", "content_fr": {"title": "🔧 Quoi de neuf ?", "subtitle": "Dernières améliorations"}, "content_en": {"title": "🔧 What''s new?", "subtitle": "Latest improvements"}, "settings": {"backgroundColor": "#374151", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Nous travaillons constamment à améliorer votre expérience. Voici les nouveautés de ce mois :</p>"}, "content_en": {"html": "<p>We are constantly working to improve your experience. Here are this month''s updates:</p>"}, "settings": {}},
   {"type": "list", "content_fr": {"items": ["{{update_1}}", "{{update_2}}", "{{update_3}}", "{{update_4}}"]}, "content_en": {"items": ["{{update_1_en}}", "{{update_2_en}}", "{{update_3_en}}", "{{update_4_en}}"]}, "settings": {"style": "check"}},
   {"type": "button", "content_fr": {"text": "Découvrir", "url": "{{cta_url}}"}, "content_en": {"text": "Discover", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#374151", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#F9FAFB", "fontFamily": "Arial, sans-serif", "headerColor": "#374151", "textColor": "#333333", "buttonColor": "#374151", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 32. City Spotlight
('Ville à l''honneur', 'Mise en avant d''une ville marocaine', 'general', 'all',
 '🏙️ Découvrez {{city_name}} : La destination du mois !', '🏙️ Discover {{city_name}}: Destination of the month!',
 'Les meilleures adresses de {{city_name}}', 'The best addresses in {{city_name}}',
 '[
   {"type": "header", "content_fr": {"title": "🏙️ {{city_name}}", "subtitle": "Destination du mois"}, "content_en": {"title": "🏙️ {{city_name}}", "subtitle": "Destination of the month"}, "settings": {"backgroundColor": "#065F46", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{city_hero}}", "alt": "{{city_name}}"}, "content_en": {"url": "{{city_hero}}", "alt": "{{city_name}}"}, "settings": {"fullWidth": true}},
   {"type": "text", "content_fr": {"html": "<p>Ce mois-ci, partez à la découverte de <strong>{{city_name}}</strong> ! Voici notre sélection des meilleures expériences :</p>"}, "content_en": {"html": "<p>This month, discover <strong>{{city_name}}</strong>! Here is our selection of the best experiences:</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "🍽️", "title": "Restaurants", "text": "{{restaurants_count}} adresses"}, {"icon": "🏨", "title": "Hôtels", "text": "{{hotels_count}} établissements"}, {"icon": "🎭", "title": "Activités", "text": "{{activities_count}} expériences"}]}, "content_en": {"columns": [{"icon": "🍽️", "title": "Restaurants", "text": "{{restaurants_count}} addresses"}, {"icon": "🏨", "title": "Hotels", "text": "{{hotels_count}} establishments"}, {"icon": "🎭", "title": "Activities", "text": "{{activities_count}} experiences"}]}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Explorer {{city_name}}", "url": "{{cta_url}}"}, "content_en": {"text": "Explore {{city_name}}", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#065F46", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#ECFDF5", "fontFamily": "Arial, sans-serif", "headerColor": "#065F46", "textColor": "#333333", "buttonColor": "#065F46", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true),

-- 33. Blog Digest
('Digest Blog', 'Résumé des derniers articles du blog', 'general', 'all',
 '📰 Les derniers articles du blog Sortir Au Maroc', '📰 Latest articles from the Sortir Au Maroc blog',
 'Guides, conseils et découvertes', 'Guides, tips and discoveries',
 '[
   {"type": "header", "content_fr": {"title": "📰 Blog Digest", "subtitle": "Les derniers articles"}, "content_en": {"title": "📰 Blog Digest", "subtitle": "Latest articles"}, "settings": {"backgroundColor": "#1E3A8A", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>Découvrez nos derniers articles pour enrichir vos sorties :</p>"}, "content_en": {"html": "<p>Discover our latest articles to enrich your outings:</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"image": "{{article_1_image}}", "title": "{{article_1_title}}", "text": "Lire l''article →"}, {"image": "{{article_2_image}}", "title": "{{article_2_title}}", "text": "Lire l''article →"}]}, "content_en": {"columns": [{"image": "{{article_1_image}}", "title": "{{article_1_title}}", "text": "Read article →"}, {"image": "{{article_2_image}}", "title": "{{article_2_title}}", "text": "Read article →"}]}, "settings": {"imageStyle": "rounded", "clickable": true}},
   {"type": "button", "content_fr": {"text": "Voir tous les articles", "url": "{{cta_url}}"}, "content_en": {"text": "See all articles", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#1E3A8A", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#EFF6FF", "fontFamily": "Georgia, serif", "headerColor": "#1E3A8A", "textColor": "#333333", "buttonColor": "#1E3A8A", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 34. Partnership Announcement
('Annonce Partenariat', 'Annonce d''un nouveau partenariat', 'general', 'all',
 '🤝 Nouveau partenariat : {{partner_name}} rejoint Sortir Au Maroc !', '🤝 New partnership: {{partner_name}} joins Sortir Au Maroc!',
 'Une nouvelle collaboration passionnante', 'An exciting new collaboration',
 '[
   {"type": "header", "content_fr": {"title": "🤝 Nouveau Partenariat", "subtitle": "{{partner_name}}"}, "content_en": {"title": "🤝 New Partnership", "subtitle": "{{partner_name}}"}, "settings": {"backgroundColor": "#7C3AED", "textColor": "#FFFFFF"}},
   {"type": "image", "content_fr": {"url": "{{partner_logo}}", "alt": "{{partner_name}}"}, "content_en": {"url": "{{partner_logo}}", "alt": "{{partner_name}}"}, "settings": {"maxWidth": "200px", "align": "center"}},
   {"type": "text", "content_fr": {"html": "<p>Nous sommes ravis d''annoncer notre partenariat avec <strong>{{partner_name}}</strong> !</p><p>{{partnership_description}}</p>"}, "content_en": {"html": "<p>We are delighted to announce our partnership with <strong>{{partner_name}}</strong>!</p><p>{{partnership_description_en}}</p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "En savoir plus", "url": "{{cta_url}}"}, "content_en": {"text": "Learn more", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#7C3AED", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#F5F3FF", "fontFamily": "Arial, sans-serif", "headerColor": "#7C3AED", "textColor": "#333333", "buttonColor": "#7C3AED", "buttonTextColor": "#FFFFFF"}'::jsonb,
 false),

-- 35. Year in Review
('Bilan Annuel', 'Récapitulatif de l''année', 'general', 'all',
 '🎊 Votre année 2026 avec Sortir Au Maroc', '🎊 Your 2026 with Sortir Au Maroc',
 'Revivez vos meilleurs moments', 'Relive your best moments',
 '[
   {"type": "header", "content_fr": {"title": "🎊 Votre Année 2026", "subtitle": "Vos meilleurs moments"}, "content_en": {"title": "🎊 Your Year 2026", "subtitle": "Your best moments"}, "settings": {"backgroundColor": "#DC2626", "textColor": "#FFFFFF"}},
   {"type": "text", "content_fr": {"html": "<p>{{first_name}}, quelle année incroyable ! Voici un récapitulatif de vos moments avec Sortir Au Maroc :</p>"}, "content_en": {"html": "<p>{{first_name}}, what an incredible year! Here is a recap of your moments with Sortir Au Maroc:</p>"}, "settings": {}},
   {"type": "columns", "content_fr": {"columns": [{"icon": "📅", "title": "{{bookings_count}}", "text": "Réservations"}, {"icon": "🏙️", "title": "{{cities_count}}", "text": "Villes visitées"}, {"icon": "❤️", "title": "{{favorites_count}}", "text": "Coups de cœur"}]}, "content_en": {"columns": [{"icon": "📅", "title": "{{bookings_count}}", "text": "Bookings"}, {"icon": "🏙️", "title": "{{cities_count}}", "text": "Cities visited"}, {"icon": "❤️", "title": "{{favorites_count}}", "text": "Favorites"}]}, "settings": {}},
   {"type": "text", "content_fr": {"html": "<p style=\"text-align: center;\"><strong>Votre établissement préféré :</strong><br/>{{favorite_establishment}}</p>"}, "content_en": {"html": "<p style=\"text-align: center;\"><strong>Your favorite establishment:</strong><br/>{{favorite_establishment}}</p>"}, "settings": {}},
   {"type": "button", "content_fr": {"text": "Voir mon récap complet", "url": "{{cta_url}}"}, "content_en": {"text": "See my full recap", "url": "{{cta_url}}"}, "settings": {"backgroundColor": "#DC2626", "textColor": "#FFFFFF", "align": "center"}}
 ]'::jsonb,
 '{"backgroundColor": "#FEF2F2", "fontFamily": "Arial, sans-serif", "headerColor": "#DC2626", "textColor": "#333333", "buttonColor": "#DC2626", "buttonTextColor": "#FFFFFF"}'::jsonb,
 true);

-- Add comment
COMMENT ON TABLE newsletter_templates IS 'Newsletter templates for marketing campaigns with drag-drop builder support';
COMMENT ON TABLE newsletter_campaigns IS 'Newsletter campaign instances created from templates';
COMMENT ON TABLE newsletter_assets IS 'Media assets (images, videos) for newsletter content';
COMMENT ON TABLE newsletter_saved_blocks IS 'Reusable content blocks for the newsletter builder';
