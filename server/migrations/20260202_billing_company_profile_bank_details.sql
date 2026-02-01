begin;

-- Add optional bank details fields used for virement (bank transfer) instructions.
-- These are intentionally nullable so the admin can fill them later.

alter table public.billing_company_profile
  add column if not exists bank_name text,
  add column if not exists rib text,
  add column if not exists iban text,
  add column if not exists swift text,
  add column if not exists bank_account_holder text,
  add column if not exists bank_instructions text;

commit;
