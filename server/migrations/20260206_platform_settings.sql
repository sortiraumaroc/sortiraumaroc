-- ============================================================================
-- PLATFORM SETTINGS - Global Platform Configuration
-- ============================================================================
-- This table stores platform-wide settings that control the platform mode
-- and feature availability. Changes are made by Superadmin only.
-- ============================================================================

-- Create the platform_settings table
create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  value_type text not null default 'string' check (value_type in ('string', 'boolean', 'number', 'json')),
  label text not null,
  description text,
  category text not null default 'general',
  is_sensitive boolean not null default false,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add comments
comment on table public.platform_settings is 'Platform-wide configuration settings managed by Superadmin';
comment on column public.platform_settings.key is 'Unique setting key (e.g., PLATFORM_MODE, PAYMENTS_ENABLED)';
comment on column public.platform_settings.value is 'Setting value as string (parsed based on value_type)';
comment on column public.platform_settings.value_type is 'Type hint for parsing: string, boolean, number, json';
comment on column public.platform_settings.category is 'Setting category for grouping in UI';
comment on column public.platform_settings.is_sensitive is 'If true, value is hidden in logs and non-superadmin responses';

-- Enable RLS
alter table public.platform_settings enable row level security;

-- RLS Policies: Only service_role can read/write (API handles auth)
create policy "Service role full access to platform_settings"
  on public.platform_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Index for category filtering
create index if not exists idx_platform_settings_category on public.platform_settings(category);

-- ============================================================================
-- SEED DEFAULT SETTINGS
-- ============================================================================

insert into public.platform_settings (key, value, value_type, label, description, category) values
  -- Platform Mode
  ('PLATFORM_MODE', 'test', 'string', 'Mode de la Plateforme', 'Mode actuel: test (Phase 1) ou commercial (Phase 2). En mode test, les paiements de réservation sont désactivés.', 'mode'),

  -- Phase 1 Feature Flags
  ('PAYMENTS_RESERVATIONS_ENABLED', 'false', 'boolean', 'Paiements Réservations', 'Activer les paiements (dépôts, garanties) sur les réservations', 'payments'),
  ('COMMISSIONS_ENABLED', 'false', 'boolean', 'Commissions', 'Activer le calcul et prélèvement des commissions sur réservations', 'payments'),
  ('SUBSCRIPTIONS_ENABLED', 'false', 'boolean', 'Abonnements PRO', 'Activer le système d''abonnements pour les professionnels', 'payments'),
  ('PACKS_PURCHASES_ENABLED', 'false', 'boolean', 'Achats de Packs', 'Permettre aux clients d''acheter des packs/offres', 'payments'),
  ('PAYOUTS_ENABLED', 'false', 'boolean', 'Payouts PRO', 'Permettre aux PROs de demander des virements de leurs gains', 'payments'),
  ('GUARANTEE_DEPOSITS_ENABLED', 'false', 'boolean', 'Garanties Anti No-Show', 'Exiger des garanties/dépôts pour certaines réservations', 'payments'),
  ('WALLET_CREDITS_ENABLED', 'false', 'boolean', 'Wallet & Crédits', 'Activer le système de wallet et crédits utilisateur', 'payments'),

  -- Always Active Features (for reference)
  ('VISIBILITY_ORDERS_ENABLED', 'true', 'boolean', 'Commandes Visibilité', 'Permettre l''achat de services de visibilité (vidéos, stories, etc.)', 'visibility'),
  ('FREE_RESERVATIONS_ENABLED', 'true', 'boolean', 'Réservations Gratuites', 'Permettre les réservations sans paiement', 'reservations'),

  -- Branding
  ('BRAND_NAME', 'Sortir Au Maroc', 'string', 'Nom de Marque', 'Nom principal de la plateforme', 'branding'),
  ('BRAND_SHORT', 'SAM', 'string', 'Nom Court', 'Acronyme/nom court de la plateforme', 'branding'),
  ('BRAND_DOMAIN', 'sortiraumaroc.ma', 'string', 'Domaine Principal', 'Domaine web principal', 'branding')

on conflict (key) do nothing;

-- ============================================================================
-- HELPER FUNCTION: Get platform setting value
-- ============================================================================

create or replace function public.get_platform_setting(setting_key text)
returns text
language sql
stable
security definer
as $$
  select value from public.platform_settings where key = setting_key limit 1;
$$;

create or replace function public.get_platform_setting_bool(setting_key text)
returns boolean
language sql
stable
security definer
as $$
  select value = 'true' from public.platform_settings where key = setting_key limit 1;
$$;

-- Grant execute to authenticated users (read-only via function)
grant execute on function public.get_platform_setting(text) to authenticated;
grant execute on function public.get_platform_setting_bool(text) to authenticated;

-- ============================================================================
-- AUDIT TRIGGER: Log all changes
-- ============================================================================

create or replace function public.platform_settings_audit_trigger()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Update the updated_at timestamp
  new.updated_at := now();

  -- Log to admin_audit_log if table exists
  if exists (select 1 from information_schema.tables where table_name = 'admin_audit_log') then
    insert into public.admin_audit_log (action, entity_type, entity_id, metadata, created_at)
    values (
      'settings.platform.update',
      'platform_settings',
      new.key,
      jsonb_build_object(
        'old_value', old.value,
        'new_value', new.value,
        'updated_by', new.updated_by
      ),
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists platform_settings_audit on public.platform_settings;
create trigger platform_settings_audit
  before update on public.platform_settings
  for each row
  execute function public.platform_settings_audit_trigger();
