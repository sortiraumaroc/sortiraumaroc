-- The "finance" schema is not exposed via PostgREST by default on Supabase.
-- Server code uses Supabase JS (PostgREST) and therefore cannot query finance.* tables directly.
--
-- Solution: create public views (prefixed with finance_) that map 1:1 to finance schema tables.
-- These views are in the public schema (exposed) and are granted to service_role only.

create schema if not exists finance;

-- NOTE: keep views thin (select *), so they remain auto-updatable.

create or replace view public.finance_accounts as
select *
from finance.accounts;

grant select, insert, update, delete on public.finance_accounts to service_role;

create or replace view public.finance_ledger_entries as
select *
from finance.ledger_entries;

grant select, insert, update, delete on public.finance_ledger_entries to service_role;

create or replace view public.finance_invoices as
select *
from finance.invoices;

grant select, insert, update, delete on public.finance_invoices to service_role;

create or replace view public.finance_escrow_holds as
select *
from finance.escrow_holds;

grant select, insert, update, delete on public.finance_escrow_holds to service_role;

create or replace view public.finance_reconciliation_discrepancies as
select *
from finance.reconciliation_discrepancies;

grant select, insert, update, delete on public.finance_reconciliation_discrepancies to service_role;

create or replace view public.finance_payouts as
select *
from finance.payouts;

grant select, insert, update, delete on public.finance_payouts to service_role;

create or replace view public.finance_payout_requests as
select *
from finance.payout_requests;

grant select, insert, update, delete on public.finance_payout_requests to service_role;

create or replace view public.finance_pro_terms as
select *
from finance.pro_terms;

grant select, insert, update, delete on public.finance_pro_terms to service_role;

create or replace view public.finance_pro_terms_acceptances as
select *
from finance.pro_terms_acceptances;

grant select, insert, update, delete on public.finance_pro_terms_acceptances to service_role;
