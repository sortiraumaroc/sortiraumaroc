begin;

create extension if not exists pgcrypto;

create or replace function public.media_next_quote_number()
returns text
language plpgsql
security definer
as $$
declare
  seq bigint;
  yy text;
begin
  yy := to_char(now(), 'YYYY');
  select nextval('public.media_quote_seq') into seq;
  return 'Q-' || yy || '-' || lpad(seq::text, 6, '0');
end;
$$;

create or replace function public.media_next_invoice_number()
returns text
language plpgsql
security definer
as $$
declare
  seq bigint;
  yy text;
begin
  yy := to_char(now(), 'YYYY');
  select nextval('public.media_invoice_seq') into seq;
  return 'F-' || yy || '-' || lpad(seq::text, 6, '0');
end;
$$;

commit;
