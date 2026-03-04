-- ============================================================
-- Fix RLS: Restrict *_service_all policies to service_role only
-- These policies were USING (TRUE) without TO clause,
-- meaning ANY authenticated user could bypass RLS.
-- Date: 2026-02-22
-- ============================================================
BEGIN;

-- -----------------------------------------------------------
-- CE Module tables (20260218_ce_module.sql)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS companies_service_all ON public.companies;
CREATE POLICY companies_service_all ON public.companies FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS company_admins_service_all ON public.company_admins;
CREATE POLICY company_admins_service_all ON public.company_admins FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS company_employees_service_all ON public.company_employees;
CREATE POLICY company_employees_service_all ON public.company_employees FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS pro_ce_advantages_service_all ON public.pro_ce_advantages;
CREATE POLICY pro_ce_advantages_service_all ON public.pro_ce_advantages FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS ce_scans_service_all ON public.ce_scans;
CREATE POLICY ce_scans_service_all ON public.ce_scans FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS ce_totp_secrets_service_all ON public.ce_totp_secrets;
CREATE POLICY ce_totp_secrets_service_all ON public.ce_totp_secrets FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- Conciergerie tables (20260222_conciergerie_mvp.sql)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS concierges_service_all ON public.concierges;
CREATE POLICY concierges_service_all ON public.concierges FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS concierge_users_service_all ON public.concierge_users;
CREATE POLICY concierge_users_service_all ON public.concierge_users FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS experience_journeys_service_all ON public.experience_journeys;
CREATE POLICY experience_journeys_service_all ON public.experience_journeys FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS journey_steps_service_all ON public.journey_steps;
CREATE POLICY journey_steps_service_all ON public.journey_steps FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS step_requests_service_all ON public.step_requests;
CREATE POLICY step_requests_service_all ON public.step_requests FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- Partner Agreements tables (20260222_partner_agreements.sql)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS partner_agreements_service_all ON public.partner_agreements;
CREATE POLICY partner_agreements_service_all ON public.partner_agreements FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS agreement_lines_service_all ON public.agreement_lines;
CREATE POLICY agreement_lines_service_all ON public.agreement_lines FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS agreement_history_service_all ON public.agreement_history;
CREATE POLICY agreement_history_service_all ON public.agreement_history FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- B2B Scans tables (20260222_b2b_scans.sql)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS b2b_scans_service_all ON public.b2b_scans;
CREATE POLICY b2b_scans_service_all ON public.b2b_scans FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS conc_scan_secrets_service_all ON public.conciergerie_scan_secrets;
CREATE POLICY conc_scan_secrets_service_all ON public.conciergerie_scan_secrets FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- User Preferences (20260215_user_preferences.sql)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS user_prefs_service_role ON public.user_preferences_computed;
CREATE POLICY user_prefs_service_role ON public.user_preferences_computed FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- Consumer TOTP tables (20260204_consumer_user_totp.sql)
-- Previously used USING(auth.jwt()->>'role'='service_role') without TO clause
-- -----------------------------------------------------------
DROP POLICY IF EXISTS consumer_totp_secrets_service_all ON public.consumer_user_totp_secrets;
CREATE POLICY consumer_totp_secrets_service_all ON public.consumer_user_totp_secrets FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS consumer_totp_logs_service_all ON public.consumer_totp_validation_logs;
CREATE POLICY consumer_totp_logs_service_all ON public.consumer_totp_validation_logs FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- Ramadan tables (20260219_ramadan_offers.sql)
-- Previously used USING(auth.role()='service_role') without TO clause
-- -----------------------------------------------------------
DROP POLICY IF EXISTS ramadan_offers_service_all ON public.ramadan_offers;
CREATE POLICY ramadan_offers_service_all ON public.ramadan_offers FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS ramadan_qr_scans_service_all ON public.ramadan_qr_scans;
CREATE POLICY ramadan_qr_scans_service_all ON public.ramadan_qr_scans FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;
