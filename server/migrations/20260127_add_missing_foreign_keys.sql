-- ============================================================================
-- Migration: Ajout des Foreign Keys manquantes
-- Date: 2026-01-27
-- Auteur: SAM Team
-- Description: Corrige les contraintes de clés étrangères manquantes
-- ============================================================================

BEGIN;

-- ============================================
-- 1. consumer_promo_code_redemptions
-- Ajout de la FK vers consumer_users
-- ============================================

-- Vérifier si la contrainte existe déjà
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_consumer_promo_redemptions_user'
  ) THEN
    ALTER TABLE public.consumer_promo_code_redemptions
      ADD CONSTRAINT fk_consumer_promo_redemptions_user
      FOREIGN KEY (user_id)
      REFERENCES public.consumer_users(id)
      ON DELETE CASCADE;

    RAISE NOTICE 'FK fk_consumer_promo_redemptions_user created';
  ELSE
    RAISE NOTICE 'FK fk_consumer_promo_redemptions_user already exists';
  END IF;
END $$;

-- Index pour la performance des lookups
CREATE INDEX IF NOT EXISTS idx_consumer_promo_redemptions_user_id
  ON public.consumer_promo_code_redemptions(user_id);

-- ============================================
-- 2. email_campaign_recipients
-- Ajout d'une contrainte CHECK sur recipient_type
-- (FK polymorphique impossible, on ajoute une validation)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_email_recipients_type_valid'
  ) THEN
    ALTER TABLE public.email_campaign_recipients
      ADD CONSTRAINT chk_email_recipients_type_valid
      CHECK (recipient_type IN ('consumer', 'pro'));

    RAISE NOTICE 'CHECK constraint chk_email_recipients_type_valid created';
  ELSE
    RAISE NOTICE 'CHECK constraint chk_email_recipients_type_valid already exists';
  END IF;
END $$;

-- Index composite pour les requêtes par type et statut
CREATE INDEX IF NOT EXISTS idx_email_recipients_type_status
  ON public.email_campaign_recipients(recipient_type, status);

-- ============================================
-- 3. consumer_data_export_requests
-- Ajout de la FK vers consumer_users
-- Note: user_id doit être de type compatible (text ou uuid)
-- ============================================

DO $$
BEGIN
  -- Vérifier si la contrainte existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_export_requests_user'
  ) THEN
    -- Ajouter la contrainte
    ALTER TABLE public.consumer_data_export_requests
      ADD CONSTRAINT fk_export_requests_user
      FOREIGN KEY (user_id)
      REFERENCES public.consumer_users(id)
      ON DELETE CASCADE;

    RAISE NOTICE 'FK fk_export_requests_user created';
  ELSE
    RAISE NOTICE 'FK fk_export_requests_user already exists';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add FK fk_export_requests_user: %', SQLERRM;
END $$;

-- Index pour la performance
CREATE INDEX IF NOT EXISTS idx_export_requests_user_id
  ON public.consumer_data_export_requests(user_id);

-- ============================================
-- 4. media_jobs - responsible_admin_id
-- Note: Cette colonne peut être TEXT ou UUID selon l'implémentation
-- On ajoute un index uniquement si la colonne existe
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'media_jobs'
    AND column_name = 'responsible_admin_id'
  ) THEN
    -- Créer l'index si pas existant
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'media_jobs'
      AND indexname = 'idx_media_jobs_responsible_admin'
    ) THEN
      CREATE INDEX idx_media_jobs_responsible_admin
        ON public.media_jobs(responsible_admin_id);
      RAISE NOTICE 'Index idx_media_jobs_responsible_admin created';
    ELSE
      RAISE NOTICE 'Index idx_media_jobs_responsible_admin already exists';
    END IF;
  ELSE
    RAISE NOTICE 'Column media_jobs.responsible_admin_id does not exist';
  END IF;
END $$;

-- ============================================
-- 5. Codes promo - Case-insensitive uniqueness
-- Ajout d'index uniques sur LOWER(code) pour éviter les doublons
-- ============================================

-- Consumer promo codes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'consumer_promo_codes'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'consumer_promo_codes'
      AND indexname = 'ux_consumer_promo_codes_code_lower'
    ) THEN
      CREATE UNIQUE INDEX ux_consumer_promo_codes_code_lower
        ON public.consumer_promo_codes(LOWER(code));
      RAISE NOTICE 'Unique index ux_consumer_promo_codes_code_lower created';
    ELSE
      RAISE NOTICE 'Unique index ux_consumer_promo_codes_code_lower already exists';
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not create ux_consumer_promo_codes_code_lower: %', SQLERRM;
END $$;

-- Visibility promo codes (Pro)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'visibility_promo_codes'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'visibility_promo_codes'
      AND indexname = 'ux_visibility_promo_codes_code_lower'
    ) THEN
      CREATE UNIQUE INDEX ux_visibility_promo_codes_code_lower
        ON public.visibility_promo_codes(LOWER(code));
      RAISE NOTICE 'Unique index ux_visibility_promo_codes_code_lower created';
    ELSE
      RAISE NOTICE 'Unique index ux_visibility_promo_codes_code_lower already exists';
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not create ux_visibility_promo_codes_code_lower: %', SQLERRM;
END $$;

-- ============================================
-- 6. Ajout de commentaires pour documentation
-- ============================================

COMMENT ON CONSTRAINT fk_consumer_promo_redemptions_user ON public.consumer_promo_code_redemptions IS
  'Garantit que user_id référence un utilisateur consumer existant';

COMMENT ON CONSTRAINT chk_email_recipients_type_valid ON public.email_campaign_recipients IS
  'Limite recipient_type aux valeurs autorisées: consumer, pro';

COMMIT;

-- Note: Cette migration est idempotente et peut être rejouée sans erreur
