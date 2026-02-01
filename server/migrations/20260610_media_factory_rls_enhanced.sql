-- ============================================================================
-- Enhanced RLS Policies for Media Factory
-- Adds INSERT/UPDATE policies for defense-in-depth security
-- Server uses service role for writes, but these policies provide extra security
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Partner INSERT on media_deliverable_files
-- Partners can insert files for their assigned deliverables
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_deliverable_files'
      and policyname = 'partner_media_deliverable_files_insert'
  ) then
    create policy partner_media_deliverable_files_insert
      on public.media_deliverable_files
      for insert
      with check (
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
-- Partner UPDATE on media_deliverables
-- Partners can update status/version for their assigned deliverables
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_deliverables'
      and policyname = 'partner_media_deliverables_update'
  ) then
    create policy partner_media_deliverables_update
      on public.media_deliverables
      for update
      using (assigned_partner_user_id = auth.uid())
      with check (assigned_partner_user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PRO INSERT on media_briefs
-- PROs can create briefs for their establishment's jobs
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_briefs'
      and policyname = 'pro_media_briefs_insert'
  ) then
    create policy pro_media_briefs_insert
      on public.media_briefs
      for insert
      with check (
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
-- PRO UPDATE on media_briefs
-- PROs can update briefs for their establishment's jobs
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_briefs'
      and policyname = 'pro_media_briefs_update'
  ) then
    create policy pro_media_briefs_update
      on public.media_briefs
      for update
      using (
        exists (
          select 1
          from public.media_jobs j
          join public.pro_establishment_memberships m
            on m.establishment_id = j.establishment_id
          where j.id = media_briefs.job_id
            and m.user_id = auth.uid()
        )
      )
      with check (
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
-- PRO SELECT on media_schedule_slots (already might exist but ensure)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- PRO SELECT on media_appointments
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_appointments'
      and policyname = 'pro_media_appointments_select'
  ) then
    create policy pro_media_appointments_select
      on public.media_appointments
      for select
      using (
        exists (
          select 1
          from public.media_jobs j
          join public.pro_establishment_memberships m
            on m.establishment_id = j.establishment_id
          where j.id = media_appointments.job_id
            and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PRO SELECT on media_checkins
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media_checkins'
      and policyname = 'pro_media_checkins_select'
  ) then
    create policy pro_media_checkins_select
      on public.media_checkins
      for select
      using (
        exists (
          select 1
          from public.media_jobs j
          join public.pro_establishment_memberships m
            on m.establishment_id = j.establishment_id
          where j.id = media_checkins.job_id
            and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Partner SELECT on partner_invoice_requests
-- Partners can view their own invoice requests
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'partner_invoice_requests'
      and policyname = 'partner_invoice_requests_select'
  ) then
    create policy partner_invoice_requests_select
      on public.partner_invoice_requests
      for select
      using (partner_user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Partner INSERT on partner_invoice_requests
-- Partners can create invoice requests for their assigned jobs
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'partner_invoice_requests'
      and policyname = 'partner_invoice_requests_insert'
  ) then
    create policy partner_invoice_requests_insert
      on public.partner_invoice_requests
      for insert
      with check (partner_user_id = auth.uid());
  end if;
end $$;
