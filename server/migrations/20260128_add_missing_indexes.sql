-- ============================================================================
-- Migration: Ajout des index manquants
-- Date: 2026-01-28
-- Auteur: Sam'Booking Team
-- Description: Améliore les performances des requêtes fréquentes
-- ============================================================================

-- Note: On utilise CREATE INDEX CONCURRENTLY pour ne pas bloquer les écritures
-- Cependant, CONCURRENTLY ne peut pas être dans une transaction, donc pas de BEGIN/COMMIT

-- ============================================
-- TABLES CONSUMER
-- ============================================

-- Filtrage par statut de compte (fréquent dans l'admin)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_consumer_users_account_status
  ON public.consumer_users(account_status);

-- Score de fiabilité (tri fréquent, filtrage par score)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consumer_user_stats'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'consumer_user_stats'
      AND indexname = 'idx_consumer_user_stats_reliability'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_consumer_user_stats_reliability ON public.consumer_user_stats(reliability_score DESC)';
    END IF;
  END IF;
END $$;

-- ============================================
-- TABLES MEDIA FACTORY
-- ============================================

-- Jobs par statut (dashboard admin)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'media_jobs'
  ) THEN
    -- Index simple sur status
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'media_jobs'
      AND indexname = 'idx_media_jobs_status'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_media_jobs_status ON public.media_jobs(status)';
    END IF;

    -- Index composite status + created_at pour le tri
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'media_jobs'
      AND indexname = 'idx_media_jobs_status_created'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_media_jobs_status_created ON public.media_jobs(status, created_at DESC)';
    END IF;
  END IF;
END $$;

-- Deliverables par statut
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'media_deliverables'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'media_deliverables'
      AND indexname = 'idx_media_deliverables_status'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_media_deliverables_status ON public.media_deliverables(status)';
    END IF;
  END IF;
END $$;

-- Quotes et Invoices par admin (audit)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'media_quotes'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'media_quotes'
      AND indexname = 'idx_media_quotes_admin'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_media_quotes_admin ON public.media_quotes(created_by_admin_id)';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'media_invoices'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'media_invoices'
      AND indexname = 'idx_media_invoices_admin'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_media_invoices_admin ON public.media_invoices(created_by_admin_id)';
    END IF;
  END IF;
END $$;

-- ============================================
-- TABLES EMAIL
-- ============================================

-- Campagnes par audience et statut (filtres admin)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_campaigns'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'email_campaigns'
      AND indexname = 'idx_email_campaigns_audience_status'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_email_campaigns_audience_status ON public.email_campaigns(audience, status)';
    END IF;
  END IF;
END $$;

-- Events par recipient (tracking engagement)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_events'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'email_events'
      AND indexname = 'idx_email_events_recipient_kind'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_email_events_recipient_kind ON public.email_events(recipient_id, kind)';
    END IF;
  END IF;
END $$;

-- ============================================
-- TABLES FINANCE (schéma finance)
-- ============================================

-- Factures par statut (filtres admin)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'finance' AND table_name = 'invoices'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'finance'
      AND tablename = 'invoices'
      AND indexname = 'idx_finance_invoices_status'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_finance_invoices_status ON finance.invoices(status)';
    END IF;
  END IF;
END $$;

-- Payout requests par statut et date (dashboard admin)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'finance' AND table_name = 'payout_requests'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'finance'
      AND tablename = 'payout_requests'
      AND indexname = 'idx_finance_payout_requests_status_created'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_finance_payout_requests_status_created ON finance.payout_requests(status, created_at DESC)';
    END IF;
  END IF;
END $$;

-- ============================================
-- TABLES PRO
-- ============================================

-- Campagnes actives
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pro_campaigns'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'pro_campaigns'
      AND indexname = 'idx_pro_campaigns_status'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_pro_campaigns_status ON public.pro_campaigns(status)';
    END IF;
  END IF;
END $$;

-- Events par type et date (analytics)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pro_campaign_events'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'pro_campaign_events'
      AND indexname = 'idx_pro_campaign_events_type_created'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_pro_campaign_events_type_created ON public.pro_campaign_events(event_type, created_at DESC)';
    END IF;
  END IF;
END $$;

-- ============================================
-- TABLES BLOG
-- ============================================

-- Auteurs actifs (filtre fréquent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'blog_authors'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'blog_authors'
      AND indexname = 'idx_blog_authors_active'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_blog_authors_active ON public.blog_authors(is_active) WHERE is_active = true';
    END IF;
  END IF;
END $$;

-- Catégories par ordre d'affichage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'blog_categories'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'blog_categories'
      AND indexname = 'idx_blog_categories_order'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_blog_categories_order ON public.blog_categories(display_order)';
    END IF;
  END IF;
END $$;

-- ============================================
-- TABLES RÉSERVATIONS
-- ============================================

-- Réservations par utilisateur et statut (historique utilisateur)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reservations'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'reservations'
      AND indexname = 'idx_reservations_user_status'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_reservations_user_status ON public.reservations(user_id, status)';
    END IF;

    -- Réservations par établissement et date (dashboard pro)
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'reservations'
      AND indexname = 'idx_reservations_establishment_date'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_reservations_establishment_date ON public.reservations(establishment_id, starts_at DESC)';
    END IF;
  END IF;
END $$;

-- ============================================
-- TABLES WAITLIST
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'waitlist_entries'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'waitlist_entries'
      AND indexname = 'idx_waitlist_status_created'
    ) THEN
      EXECUTE 'CREATE INDEX CONCURRENTLY idx_waitlist_status_created ON public.waitlist_entries(status, created_at DESC)';
    END IF;
  END IF;
END $$;

-- ============================================
-- DOCUMENTATION
-- ============================================

-- Commentaires sur les index importants
COMMENT ON INDEX public.idx_consumer_users_account_status IS
  'Optimise les filtres admin par statut de compte (active, deactivated, deleted)';

-- Note: Cette migration utilise CONCURRENTLY pour éviter de bloquer les écritures
-- En cas d'échec, les index peuvent être recréés manuellement
