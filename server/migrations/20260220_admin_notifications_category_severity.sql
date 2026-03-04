-- Migration: Ajout des colonnes category et severity aux notifications admin
-- Permet le filtrage par catégorie et sévérité côté API et UI

-- Ajout colonne category
ALTER TABLE admin_notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system';

-- Ajout colonne severity
ALTER TABLE admin_notifications
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info';

-- Index pour filtrage par catégorie
CREATE INDEX IF NOT EXISTS idx_admin_notifications_category
  ON admin_notifications (category, created_at DESC);

-- Index pour filtrage par sévérité
CREATE INDEX IF NOT EXISTS idx_admin_notifications_severity
  ON admin_notifications (severity, created_at DESC);

-- Backfill : déduire la catégorie depuis le type pour les notifications existantes
UPDATE admin_notifications SET category = CASE
  WHEN type ILIKE '%reservation%' OR type ILIKE '%booking%' OR type ILIKE '%waitlist%' OR type ILIKE '%cancellation%' OR type ILIKE '%noshow%' THEN 'booking'
  WHEN type ILIKE '%payment%' OR type ILIKE '%payout%' OR type ILIKE '%finance%' THEN 'finance'
  WHEN type ILIKE '%moderation%' OR type ILIKE '%profile_update%' OR type ILIKE '%inventory%' OR type ILIKE '%ad_campaign%' OR type ILIKE '%pack%' OR type ILIKE '%claim%' OR type ILIKE '%username%' THEN 'moderation'
  WHEN type ILIKE '%support%' OR type ILIKE '%message%' THEN 'support'
  WHEN type ILIKE '%visibility%' THEN 'visibility'
  WHEN type ILIKE '%review%' OR type ILIKE '%signal%' THEN 'review'
  WHEN type ILIKE '%ramadan%' THEN 'ramadan'
  WHEN type ILIKE '%fraud%' OR type ILIKE '%alert%' THEN 'alert'
  ELSE 'system'
END
WHERE category = 'system';

-- Backfill severity
UPDATE admin_notifications SET severity = CASE
  WHEN type ILIKE '%fraud%' OR type ILIKE '%alert%' OR type ILIKE '%finance_discrepancy%' THEN 'critical'
  WHEN type ILIKE '%reject%' OR type ILIKE '%modification_requested%' OR type ILIKE '%cancellation%' OR type ILIKE '%noshow%' THEN 'warning'
  ELSE 'info'
END
WHERE severity = 'info';
