-- Persistent invoices (all invoice types)
--
-- Provides sequential numbering via a Postgres sequence.
-- invoice_number is derived from issued_at + invoice_seq via a BEFORE INSERT trigger.
-- (Generated columns require immutable expressions and timestamptz year extraction isn't immutable.)

CREATE SCHEMA IF NOT EXISTS finance;

CREATE SEQUENCE IF NOT EXISTS finance.invoice_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS finance.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Strictly monotonic sequence (across all years).
  invoice_seq bigint NOT NULL DEFAULT nextval('finance.invoice_seq'),

  issued_at timestamptz NOT NULL DEFAULT now(),

  -- Human readable number. Set by trigger.
  -- Format: SAM-YYYY-000123
  invoice_number text NOT NULL,

  reference_type text NOT NULL,
  reference_id uuid NOT NULL,

  -- Optional deduplication key when the creation is driven by external systems (webhooks, etc.).
  idempotency_key text NULL,

  payer_user_id uuid NULL,
  establishment_id uuid NULL,

  amount_cents integer NOT NULL,
  currency text NOT NULL,

  status text NOT NULL DEFAULT 'issued',

  -- Immutable accounting snapshot (reservation / pack_purchase / pro_invoice and computed fields).
  snapshot jsonb NOT NULL,

  pdf_url text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION finance.invoices_set_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.issued_at IS NULL THEN
    NEW.issued_at := now();
  END IF;

  IF NEW.invoice_seq IS NULL THEN
    NEW.invoice_seq := nextval('finance.invoice_seq');
  END IF;

  IF NEW.invoice_number IS NULL OR btrim(NEW.invoice_number) = '' THEN
    -- Use UTC year to keep the number stable regardless of server timezone.
    NEW.invoice_number := 'SAM-' || to_char(NEW.issued_at AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(NEW.invoice_seq::text, 6, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_set_invoice_number ON finance.invoices;

CREATE TRIGGER invoices_set_invoice_number
BEFORE INSERT ON finance.invoices
FOR EACH ROW
EXECUTE FUNCTION finance.invoices_set_invoice_number();

CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_key
  ON finance.invoices (invoice_number);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_reference_type_id_key
  ON finance.invoices (reference_type, reference_id);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_idempotency_key_key
  ON finance.invoices (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_establishment_id_idx
  ON finance.invoices (establishment_id);

CREATE INDEX IF NOT EXISTS invoices_payer_user_id_idx
  ON finance.invoices (payer_user_id);
