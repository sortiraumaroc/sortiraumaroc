-- Migration: Advanced promo features
-- Adds: scheduling, scoping, dynamic constraints, templates, analytics tracking

-- ============================================
-- 1. Add scheduling fields to consumer_promo_codes
-- ============================================
ALTER TABLE consumer_promo_codes
ADD COLUMN IF NOT EXISTS scheduled_activation_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS scheduled_deactivation_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================
-- 2. Add scoping fields (applies to specific packs)
-- ============================================
-- Note: applies_to_pack_id already exists, we add more granular scoping
ALTER TABLE consumer_promo_codes
ADD COLUMN IF NOT EXISTS applies_to_pack_ids UUID[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS applies_to_slot_ids UUID[] DEFAULT NULL;

-- ============================================
-- 3. Add dynamic constraints
-- ============================================
ALTER TABLE consumer_promo_codes
ADD COLUMN IF NOT EXISTS min_cart_amount INTEGER DEFAULT NULL, -- in cents
ADD COLUMN IF NOT EXISTS valid_days_of_week INTEGER[] DEFAULT NULL, -- 0=Sunday, 1=Monday, ..., 6=Saturday
ADD COLUMN IF NOT EXISTS valid_hours_start TIME DEFAULT NULL,
ADD COLUMN IF NOT EXISTS valid_hours_end TIME DEFAULT NULL,
ADD COLUMN IF NOT EXISTS first_purchase_only BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS new_customers_only BOOLEAN DEFAULT FALSE;

-- ============================================
-- 4. Promo templates table
-- ============================================
CREATE TABLE IF NOT EXISTS promo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Template configuration (same fields as consumer_promo_codes)
  discount_bps INTEGER NOT NULL CHECK (discount_bps > 0 AND discount_bps <= 10000),
  is_public BOOLEAN DEFAULT FALSE,
  max_uses_total INTEGER DEFAULT NULL CHECK (max_uses_total IS NULL OR max_uses_total >= 1),
  max_uses_per_user INTEGER DEFAULT NULL CHECK (max_uses_per_user IS NULL OR max_uses_per_user >= 1),

  -- Dynamic constraints
  min_cart_amount INTEGER DEFAULT NULL,
  valid_days_of_week INTEGER[] DEFAULT NULL,
  valid_hours_start TIME DEFAULT NULL,
  valid_hours_end TIME DEFAULT NULL,
  first_purchase_only BOOLEAN DEFAULT FALSE,
  new_customers_only BOOLEAN DEFAULT FALSE,

  -- Scoping
  applies_to_pack_ids UUID[] DEFAULT NULL,
  applies_to_slot_ids UUID[] DEFAULT NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_templates_establishment ON promo_templates(establishment_id);

-- ============================================
-- 5. Promo usage tracking table (for analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS promo_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES consumer_promo_codes(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Transaction details
  pack_purchase_id UUID DEFAULT NULL,
  reservation_id UUID DEFAULT NULL,

  -- Financial impact
  original_amount INTEGER NOT NULL, -- in cents
  discount_amount INTEGER NOT NULL, -- in cents
  final_amount INTEGER NOT NULL, -- in cents

  -- Context
  used_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_promo_usage_logs_promo ON promo_usage_logs(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_usage_logs_establishment ON promo_usage_logs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_promo_usage_logs_user ON promo_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_usage_logs_date ON promo_usage_logs(used_at);

-- ============================================
-- 6. Client notification preferences for promos
-- ============================================
CREATE TABLE IF NOT EXISTS promo_notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,

  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, establishment_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_notif_subs_establishment ON promo_notification_subscriptions(establishment_id);

-- ============================================
-- 7. Promo notification history
-- ============================================
CREATE TABLE IF NOT EXISTS promo_notifications_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES consumer_promo_codes(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,

  notification_type TEXT NOT NULL CHECK (notification_type IN ('email', 'push', 'sms')),
  recipients_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW(),

  -- Campaign details
  subject TEXT,
  body TEXT,

  -- Results
  delivered_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_promo_notif_sent_promo ON promo_notifications_sent(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_notif_sent_establishment ON promo_notifications_sent(establishment_id);

-- ============================================
-- 8. Add usage count cache to consumer_promo_codes for quick analytics
-- ============================================
ALTER TABLE consumer_promo_codes
ADD COLUMN IF NOT EXISTS total_uses INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_revenue_generated INTEGER DEFAULT 0, -- in cents
ADD COLUMN IF NOT EXISTS total_discount_given INTEGER DEFAULT 0; -- in cents

-- ============================================
-- 9. Function to update promo stats (called via trigger)
-- ============================================
CREATE OR REPLACE FUNCTION update_promo_usage_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE consumer_promo_codes
  SET
    total_uses = total_uses + 1,
    total_revenue_generated = total_revenue_generated + NEW.final_amount,
    total_discount_given = total_discount_given + NEW.discount_amount,
    updated_at = NOW()
  WHERE id = NEW.promo_code_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_promo_stats ON promo_usage_logs;
CREATE TRIGGER trg_update_promo_stats
AFTER INSERT ON promo_usage_logs
FOR EACH ROW
EXECUTE FUNCTION update_promo_usage_stats();

-- ============================================
-- 10. RLS Policies
-- ============================================

-- promo_templates
ALTER TABLE promo_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pro members can manage promo templates" ON promo_templates;
CREATE POLICY "Pro members can manage promo templates" ON promo_templates
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM pro_memberships pm
    WHERE pm.establishment_id = promo_templates.establishment_id
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'marketing')
  )
);

-- promo_usage_logs
ALTER TABLE promo_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pro members can view usage logs" ON promo_usage_logs;
CREATE POLICY "Pro members can view usage logs" ON promo_usage_logs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pro_memberships pm
    WHERE pm.establishment_id = promo_usage_logs.establishment_id
    AND pm.user_id = auth.uid()
  )
);

-- promo_notification_subscriptions
ALTER TABLE promo_notification_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own subscriptions" ON promo_notification_subscriptions;
CREATE POLICY "Users can manage own subscriptions" ON promo_notification_subscriptions
FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Pro members can view subscriptions" ON promo_notification_subscriptions;
CREATE POLICY "Pro members can view subscriptions" ON promo_notification_subscriptions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pro_memberships pm
    WHERE pm.establishment_id = promo_notification_subscriptions.establishment_id
    AND pm.user_id = auth.uid()
  )
);

-- promo_notifications_sent
ALTER TABLE promo_notifications_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pro members can manage notifications" ON promo_notifications_sent;
CREATE POLICY "Pro members can manage notifications" ON promo_notifications_sent
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM pro_memberships pm
    WHERE pm.establishment_id = promo_notifications_sent.establishment_id
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'marketing')
  )
);
