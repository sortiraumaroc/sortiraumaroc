-- ============================================================
-- Module B2B Scans Unifiés (CE + Conciergerie)
-- Remplace ce_scans par b2b_scans avec scan_type
-- + Table conciergerie_scan_secrets pour QR TOTP conciergerie
-- Date: 2026-02-22
-- ============================================================
BEGIN;

-- -----------------------------------------------------------
-- 1. Table b2b_scans (remplace ce_scans + nouveau pour conciergerie)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type TEXT NOT NULL CHECK (scan_type IN ('ce', 'conciergerie')),

  -- Champs communs
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  scan_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'validated' CHECK (status IN ('validated', 'refused', 'expired')),
  refusal_reason TEXT,
  scanned_by TEXT,

  -- Commission SAM (calculee au moment du scan)
  sam_commission_amount NUMERIC,

  -- Champs CE (NULL si scan_type='conciergerie')
  employee_id UUID REFERENCES public.company_employees(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  advantage_id UUID REFERENCES public.pro_ce_advantages(id) ON DELETE SET NULL,
  agreement_line_id UUID REFERENCES public.agreement_lines(id) ON DELETE SET NULL,

  -- Champs Conciergerie (NULL si scan_type='ce')
  step_request_id UUID REFERENCES public.step_requests(id) ON DELETE SET NULL,
  concierge_id UUID REFERENCES public.concierges(id) ON DELETE SET NULL,
  journey_id UUID REFERENCES public.experience_journeys(id) ON DELETE SET NULL,
  client_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_b2b_scans_type ON public.b2b_scans (scan_type);
CREATE INDEX IF NOT EXISTS idx_b2b_scans_establishment ON public.b2b_scans (establishment_id, scan_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_scans_company ON public.b2b_scans (company_id, scan_datetime DESC) WHERE scan_type = 'ce';
CREATE INDEX IF NOT EXISTS idx_b2b_scans_employee ON public.b2b_scans (employee_id) WHERE scan_type = 'ce';
CREATE INDEX IF NOT EXISTS idx_b2b_scans_advantage ON public.b2b_scans (advantage_id) WHERE scan_type = 'ce';
CREATE INDEX IF NOT EXISTS idx_b2b_scans_concierge ON public.b2b_scans (concierge_id) WHERE scan_type = 'conciergerie';
CREATE INDEX IF NOT EXISTS idx_b2b_scans_step_request ON public.b2b_scans (step_request_id) WHERE scan_type = 'conciergerie';
CREATE INDEX IF NOT EXISTS idx_b2b_scans_agreement_line ON public.b2b_scans (agreement_line_id) WHERE agreement_line_id IS NOT NULL;

-- -----------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------
ALTER TABLE public.b2b_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY b2b_scans_service_all ON public.b2b_scans FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- 4. Table conciergerie_scan_secrets (TOTP pour QR conciergerie)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conciergerie_scan_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_request_id UUID NOT NULL REFERENCES public.step_requests(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'SHA1',
  digits INTEGER NOT NULL DEFAULT 6,
  period INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  used_at TIMESTAMPTZ,  -- NULL = pas encore scanne, une date = scanne (one-shot)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conc_scan_secrets_request
  ON public.conciergerie_scan_secrets (step_request_id);

ALTER TABLE public.conciergerie_scan_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY conc_scan_secrets_service_all ON public.conciergerie_scan_secrets FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- 5. Migrer les donnees ce_scans -> b2b_scans
-- -----------------------------------------------------------
INSERT INTO public.b2b_scans (
  id, scan_type, establishment_id, scan_datetime, status, refusal_reason, scanned_by,
  employee_id, company_id, advantage_id, created_at
)
SELECT
  id, 'ce', establishment_id, scan_datetime, status, refusal_reason, scanned_by,
  employee_id, company_id, advantage_id, created_at
FROM public.ce_scans
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------
-- 6. Notification templates
-- -----------------------------------------------------------
INSERT INTO public.notification_templates (event_type, channel, lang, subject, body, is_critical, module)
VALUES
  ('conciergerie_scan_validated', 'in_app', 'fr', 'Visite validee', 'Le client {{clientName}} a utilise son avantage chez {{establishmentName}}.', FALSE, 'conciergerie'),
  ('conciergerie_scan_qr_ready', 'in_app', 'fr', 'QR code pret', 'Le QR code pour la visite chez {{establishmentName}} est disponible.', FALSE, 'conciergerie')
ON CONFLICT DO NOTHING;

COMMIT;
