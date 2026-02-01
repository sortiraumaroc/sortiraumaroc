begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- MEDIA FACTORY — core tables
-- Goal: industrial workflow for media video production tied to existing PRO entities.
-- No parallel “clients” DB: we always link to establishments / visibility orders.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Partners (Supabase auth users)
-- ---------------------------------------------------------------------------
create table if not exists public.partner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_role text not null check (primary_role in ('camera','editor','voice','blogger','photographer')),
  display_name text not null,
  email text null,
  phone text null,
  city text null,
  active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'trg_partner_profiles_updated_at'
        and tgrelid = 'public.partner_profiles'::regclass
    ) then
      create trigger trg_partner_profiles_updated_at
      before update on public.partner_profiles
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.partner_profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'partner_profiles'
      and policyname = 'partner_profiles_self_select'
  ) then
    create policy partner_profiles_self_select
      on public.partner_profiles
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Partner billing profile (validated by accounting)
-- ---------------------------------------------------------------------------
create table if not exists public.partner_billing_profiles (
  user_id uuid primary key references public.partner_profiles(user_id) on delete cascade,
  legal_name text null,
  company_name text null,
  ice text null,
  address text null,

  bank_name text null,
  rib text null,
  iban text null,
  swift text null,
  account_holder text null,

  status text not null default 'pending' check (status in ('pending','validated','rejected')),
  validated_at timestamptz null,
  validated_by_admin_id text null,
  validation_note text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'trg_partner_billing_profiles_updated_at'
        and tgrelid = 'public.partner_billing_profiles'::regclass
    ) then
      create trigger trg_partner_billing_profiles_updated_at
      before update on public.partner_billing_profiles
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.partner_billing_profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'partner_billing_profiles'
      and policyname = 'partner_billing_profiles_self_select'
  ) then
    create policy partner_billing_profiles_self_select
      on public.partner_billing_profiles
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Media jobs (one production dossier)
-- Linked to existing visibility order item to stay aligned with purchase.
-- ---------------------------------------------------------------------------
create table if not exists public.media_jobs (
  id uuid primary key default gen_random_uuid(),

  establishment_id uuid not null references public.establishments(id) on delete cascade,
  order_id uuid null references public.visibility_orders(id) on delete set null,
  order_item_id uuid null references public.visibility_order_items(id) on delete set null,

  title text not null,
  status text not null default 'paid_created' check (
    status in (
      'paid_created',
      'brief_pending',
      'brief_submitted',
      'brief_approved',
      'scheduling',
      'shoot_confirmed',
      'checkin_pending',
      'deliverables_expected',
      'deliverables_submitted',
      'deliverables_approved',
      'editing',
      'ready_delivery',
      'scheduled_publish',
      'delivered',
      'closed'
    )
  ),

  responsible_admin_id text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_media_jobs_establishment_status
  on public.media_jobs (establishment_id, status, created_at desc);

create index if not exists idx_media_jobs_order_item
  on public.media_jobs (order_item_id);


do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'trg_media_jobs_updated_at'
        and tgrelid = 'public.media_jobs'::regclass
    ) then
      create trigger trg_media_jobs_updated_at
      before update on public.media_jobs
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.media_jobs enable row level security;

-- PRO read access only for establishments they belong to.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_jobs'
      and policyname = 'pro_media_jobs_select'
  ) then
    create policy pro_media_jobs_select
      on public.media_jobs
      for select
      using (
        exists (
          select 1
          from public.pro_establishment_memberships m
          where m.user_id = auth.uid()
            and m.establishment_id = media_jobs.establishment_id
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Briefs (dynamic payload JSON)
-- ---------------------------------------------------------------------------
create table if not exists public.media_briefs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.media_jobs(id) on delete cascade,

  status text not null default 'draft' check (status in ('draft','submitted','approved','needs_more')),

  payload jsonb not null default '{}'::jsonb,

  submitted_at timestamptz null,
  approved_at timestamptz null,
  approved_by_admin_id text null,
  review_note text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_media_briefs_job_unique on public.media_briefs (job_id);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'trg_media_briefs_updated_at'
        and tgrelid = 'public.media_briefs'::regclass
    ) then
      create trigger trg_media_briefs_updated_at
      before update on public.media_briefs
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.media_briefs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_briefs'
      and policyname = 'pro_media_briefs_select'
  ) then
    create policy pro_media_briefs_select
      on public.media_briefs
      for select
      using (
        exists (
          select 1
          from public.media_jobs j
          join public.pro_establishment_memberships m
            on m.establishment_id = j.establishment_id
          where j.id = media_briefs.job_id
            and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduling (slots proposed by RC, appointment selected/accepted by partner)
-- ---------------------------------------------------------------------------
create table if not exists public.media_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.media_jobs(id) on delete cascade,

  starts_at timestamptz not null,
  ends_at timestamptz not null,

  location_text text null,
  address text null,
  lat numeric null,
  lng numeric null,

  status text not null default 'proposed' check (status in ('proposed','selected','cancelled')),
  selected_by_user_id uuid null references auth.users(id) on delete set null,
  selected_at timestamptz null,

  created_by_admin_id text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint media_schedule_slots_time_check check (ends_at > starts_at)
);

create index if not exists idx_media_schedule_slots_job
  on public.media_schedule_slots (job_id, starts_at asc);

alter table public.media_schedule_slots enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_schedule_slots'
      and policyname = 'pro_media_schedule_slots_select'
  ) then
    create policy pro_media_schedule_slots_select
      on public.media_schedule_slots
      for select
      using (
        exists (
          select 1
          from public.media_jobs j
          join public.pro_establishment_memberships m
            on m.establishment_id = j.establishment_id
          where j.id = media_schedule_slots.job_id
            and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

create table if not exists public.media_appointments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.media_jobs(id) on delete cascade,
  slot_id uuid not null references public.media_schedule_slots(id) on delete cascade,

  partner_user_id uuid null references public.partner_profiles(user_id) on delete set null,

  status text not null default 'pending_partner' check (status in ('pending_partner','partner_accepted','partner_declined','cancelled')),
  partner_responded_at timestamptz null,

  created_by_admin_id text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_media_appointments_job_unique
  on public.media_appointments (job_id);

alter table public.media_appointments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_appointments'
      and policyname = 'partner_media_appointments_select'
  ) then
    create policy partner_media_appointments_select
      on public.media_appointments
      for select
      using (partner_user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Check-in (QR proof)
-- ---------------------------------------------------------------------------
create table if not exists public.media_checkins (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.media_jobs(id) on delete cascade,

  token_hash text unique not null,
  expires_at timestamptz null,

  pro_user_id uuid null references auth.users(id) on delete set null,
  confirmed_at timestamptz null,
  note text null,

  created_at timestamptz not null default now()
);

create index if not exists idx_media_checkins_job
  on public.media_checkins (job_id);

alter table public.media_checkins enable row level security;

-- Server-driven (no RLS policy yet). PRO access is handled by server route.

-- ---------------------------------------------------------------------------
-- Deliverables & files (versioning)
-- ---------------------------------------------------------------------------
create table if not exists public.media_deliverables (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.media_jobs(id) on delete cascade,

  role text not null check (role in ('camera','editor','voice','blogger','photographer')),
  deliverable_type text not null,

  assigned_partner_user_id uuid null references public.partner_profiles(user_id) on delete set null,

  status text not null default 'expected' check (status in ('expected','submitted','in_review','approved','rejected')),
  current_version int not null default 0,

  review_comment text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_deliverables_job
  on public.media_deliverables (job_id);

create index if not exists idx_media_deliverables_partner
  on public.media_deliverables (assigned_partner_user_id, status);

alter table public.media_deliverables enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_deliverables'
      and policyname = 'pro_media_deliverables_select'
  ) then
    create policy pro_media_deliverables_select
      on public.media_deliverables
      for select
      using (
        exists (
          select 1
          from public.media_jobs j
          join public.pro_establishment_memberships m
            on m.establishment_id = j.establishment_id
          where j.id = media_deliverables.job_id
            and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_deliverables'
      and policyname = 'partner_media_deliverables_select'
  ) then
    create policy partner_media_deliverables_select
      on public.media_deliverables
      for select
      using (assigned_partner_user_id = auth.uid());
  end if;
end $$;

create table if not exists public.media_deliverable_files (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.media_deliverables(id) on delete cascade,

  version int not null check (version > 0),

  bucket text not null,
  path text not null,
  mime_type text not null,
  size_bytes int not null default 0,

  uploaded_by_user_id uuid null references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),

  note text null
);

create unique index if not exists idx_media_deliverable_files_unique_version
  on public.media_deliverable_files (deliverable_id, version);

alter table public.media_deliverable_files enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_deliverable_files'
      and policyname = 'pro_media_deliverable_files_select'
  ) then
    create policy pro_media_deliverable_files_select
      on public.media_deliverable_files
      for select
      using (
        exists (
          select 1
          from public.media_deliverables d
          join public.media_jobs j on j.id = d.job_id
          join public.pro_establishment_memberships m on m.establishment_id = j.establishment_id
          where d.id = media_deliverable_files.deliverable_id
            and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_deliverable_files'
      and policyname = 'partner_media_deliverable_files_select'
  ) then
    create policy partner_media_deliverable_files_select
      on public.media_deliverable_files
      for select
      using (
        exists (
          select 1
          from public.media_deliverables d
          where d.id = media_deliverable_files.deliverable_id
            and d.assigned_partner_user_id = auth.uid()
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Messaging (in-app) + external comm logs
-- ---------------------------------------------------------------------------
create table if not exists public.media_threads (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.media_jobs(id) on delete cascade,
  kind text not null default 'job' check (kind in ('job')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_media_threads_job_unique on public.media_threads (job_id);

alter table public.media_threads enable row level security;

create table if not exists public.media_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.media_threads(id) on delete cascade,

  sender_type text not null check (sender_type in ('pro','partner','admin','system')),
  sender_user_id uuid null references auth.users(id) on delete set null,
  sender_admin_id text null,

  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_media_messages_thread_created
  on public.media_messages (thread_id, created_at asc);

alter table public.media_messages enable row level security;

-- Read policies for PRO and partner (write via server only)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_messages'
      and policyname = 'pro_media_messages_select'
  ) then
    create policy pro_media_messages_select
      on public.media_messages
      for select
      using (
        exists (
          select 1
          from public.media_threads t
          join public.media_jobs j on j.id = t.job_id
          join public.pro_establishment_memberships m on m.establishment_id = j.establishment_id
          where t.id = media_messages.thread_id
            and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_messages'
      and policyname = 'partner_media_messages_select'
  ) then
    create policy partner_media_messages_select
      on public.media_messages
      for select
      using (
        exists (
          select 1
          from public.media_threads t
          join public.media_deliverables d on d.job_id = t.job_id
          where t.id = media_messages.thread_id
            and d.assigned_partner_user_id = auth.uid()
        )
      );
  end if;
end $$;

create table if not exists public.media_communication_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.media_jobs(id) on delete cascade,

  method text not null check (method in ('phone','whatsapp','meeting','email','other')),
  summary text not null,
  occurred_at timestamptz not null default now(),

  created_by_admin_id text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_media_communication_logs_job
  on public.media_communication_logs (job_id, occurred_at desc);

alter table public.media_communication_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Costs + partner invoice requests
-- ---------------------------------------------------------------------------
create table if not exists public.media_cost_settings (
  role text primary key check (role in ('camera','editor','voice','blogger','photographer')),
  amount_cents int not null default 0 check (amount_cents >= 0),
  currency text not null default 'MAD',
  updated_at timestamptz not null default now()
);

alter table public.media_cost_settings enable row level security;

create table if not exists public.media_cost_overrides (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references public.partner_profiles(user_id) on delete cascade,
  role text not null check (role in ('camera','editor','voice','blogger','photographer')),
  amount_cents int not null default 0 check (amount_cents >= 0),
  currency text not null default 'MAD',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_cost_overrides_partner_role
  on public.media_cost_overrides (partner_user_id, role, active);

alter table public.media_cost_overrides enable row level security;

create table if not exists public.partner_invoice_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.media_jobs(id) on delete cascade,
  partner_user_id uuid not null references public.partner_profiles(user_id) on delete cascade,

  role text not null check (role in ('camera','editor','voice','blogger','photographer')),

  status text not null default 'not_eligible' check (
    status in ('not_eligible','eligible','requested','accounting_review','approved','paid','rejected')
  ),

  amount_cents int not null default 0 check (amount_cents >= 0),
  currency text not null default 'MAD',

  requested_at timestamptz null,
  decided_at timestamptz null,
  decided_by_admin_id text null,
  decision_note text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_partner_invoice_requests_unique
  on public.partner_invoice_requests (job_id, partner_user_id, role);

alter table public.partner_invoice_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'partner_invoice_requests'
      and policyname = 'partner_invoice_requests_self_select'
  ) then
    create policy partner_invoice_requests_self_select
      on public.partner_invoice_requests
      for select
      using (partner_user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- SLA settings
-- ---------------------------------------------------------------------------
create table if not exists public.media_sla_settings (
  id int primary key default 1,
  brief_review_hours int not null default 24 check (brief_review_hours > 0),
  deliverable_review_hours int not null default 48 check (deliverable_review_hours > 0),
  updated_at timestamptz not null default now(),
  constraint media_sla_settings_singleton_check check (id = 1)
);

alter table public.media_sla_settings enable row level security;

insert into public.media_sla_settings (id)
values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Audit logs (high-signal events)
-- ---------------------------------------------------------------------------
create table if not exists public.media_audit_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.media_jobs(id) on delete cascade,

  action text not null,
  actor_type text not null check (actor_type in ('pro','partner','admin','system')),

  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_admin_id text null,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_media_audit_logs_job_created
  on public.media_audit_logs (job_id, created_at desc);

alter table public.media_audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Storage buckets (best-effort)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values
      ('media-rushs', 'media-rushs', false),
      ('media-edits', 'media-edits', false),
      ('media-voice', 'media-voice', false),
      ('media-photos', 'media-photos', false),
      ('media-blog', 'media-blog', false),
      ('media-pdf', 'media-pdf', false)
    on conflict (id) do nothing;
  end if;
end $$;

commit;
