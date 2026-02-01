-- Admin Collaborators Table
-- Stores internal team members with role-based access to the admin dashboard

-- Table for admin collaborators
create table if not exists public.admin_collaborators (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  first_name text not null,
  last_name text not null,
  display_name text,
  function text,
  joined_at date,
  avatar_url text,
  role_id text not null default 'ops',
  status text not null default 'active' check (status in ('active', 'suspended')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for email lookups (login)
create index if not exists idx_admin_collaborators_email on public.admin_collaborators(email);

-- Index for role filtering
create index if not exists idx_admin_collaborators_role_id on public.admin_collaborators(role_id);

-- Index for status filtering
create index if not exists idx_admin_collaborators_status on public.admin_collaborators(status);

-- Table for admin roles (customizable)
create table if not exists public.admin_roles (
  id text primary key,
  name text not null,
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insert default roles
insert into public.admin_roles (id, name, permissions) values
  ('superadmin', 'Super-administrateur', '{
    "dashboard": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "users": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "pros": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "establishments": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "reservations": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "payments": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "reviews": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "deals": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "support": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "content": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "settings": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "collaborators": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "roles": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true},
    "logs": {"read": true, "write": true, "delete": true, "approve": true, "export": true, "bulk": true}
  }'),
  ('ops', 'Opérations', '{
    "dashboard": {"read": true},
    "users": {"read": true, "write": true},
    "pros": {"read": true, "write": true},
    "establishments": {"read": true, "write": true, "approve": true},
    "reservations": {"read": true, "write": true},
    "payments": {"read": true},
    "reviews": {"read": true, "write": true, "approve": true},
    "deals": {"read": true, "write": true},
    "support": {"read": true, "write": true},
    "content": {"read": true}
  }'),
  ('support', 'Support Client', '{
    "dashboard": {"read": true},
    "users": {"read": true, "write": true},
    "reservations": {"read": true, "write": true},
    "reviews": {"read": true},
    "support": {"read": true, "write": true}
  }'),
  ('marketing', 'Marketing', '{
    "dashboard": {"read": true},
    "users": {"read": true},
    "pros": {"read": true},
    "establishments": {"read": true},
    "deals": {"read": true, "write": true},
    "content": {"read": true, "write": true}
  }'),
  ('accounting', 'Comptabilité', '{
    "dashboard": {"read": true},
    "payments": {"read": true, "write": true, "export": true},
    "reservations": {"read": true, "export": true}
  }')
on conflict (id) do nothing;

-- Trigger for updated_at
create or replace function update_admin_collaborators_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_admin_collaborators_updated_at on public.admin_collaborators;
create trigger trigger_admin_collaborators_updated_at
  before update on public.admin_collaborators
  for each row execute function update_admin_collaborators_updated_at();

create or replace function update_admin_roles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_admin_roles_updated_at on public.admin_roles;
create trigger trigger_admin_roles_updated_at
  before update on public.admin_roles
  for each row execute function update_admin_roles_updated_at();

-- RLS policies (disabled by default for admin access via service role)
alter table public.admin_collaborators enable row level security;
alter table public.admin_roles enable row level security;

-- Allow service role full access (admin API uses service role)
create policy "Service role full access on admin_collaborators"
  on public.admin_collaborators
  for all
  using (true)
  with check (true);

create policy "Service role full access on admin_roles"
  on public.admin_roles
  for all
  using (true)
  with check (true);
