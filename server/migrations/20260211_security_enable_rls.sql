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
ALTER TABLE public.establishment_reports ENABLE ROW LEVEL SECURITY;

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
