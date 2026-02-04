-- Improve admin_consumer_users view to better capture phone and email
-- Phone can be in auth.users.phone (for phone auth) or in raw_user_meta_data->>'phone'
-- Email should filter out synthetic phone emails (@phone.sortiraumaroc.ma)

begin;

-- Drop and recreate the view with improved phone/email handling
create or replace view public.admin_consumer_users as
select
  u.id,
  u.full_name as name,
  coalesce(
    nullif(trim(concat_ws(' ',
      nullif((au.raw_user_meta_data->>'first_name')::text, ''),
      nullif((au.raw_user_meta_data->>'last_name')::text, '')
    )), ''),
    u.full_name
  ) as display_name,
  (au.raw_user_meta_data->>'first_name')::text as first_name,
  (au.raw_user_meta_data->>'last_name')::text as last_name,
  -- Phone: prefer auth.users.phone (for phone auth), fallback to metadata
  coalesce(
    nullif(au.phone, ''),
    nullif((au.raw_user_meta_data->>'phone')::text, '')
  ) as phone,
  -- Email: filter out synthetic phone emails
  case
    when u.email like '%@phone.sortiraumaroc.ma' then null
    else u.email
  end as email,
  -- Auth method indicator
  case
    when au.phone is not null and au.phone != '' then 'phone'
    when u.email like '%@phone.sortiraumaroc.ma' then 'phone'
    else 'email'
  end as auth_method,
  u.status,
  s.reliability_score,
  s.reservations_count,
  s.no_shows_count,
  u.city,
  u.country,
  u.created_at,
  coalesce(s.last_activity_at, u.created_at) as last_activity_at,
  u.account_status,
  u.deactivated_at,
  u.deleted_at,
  u.account_reason_code,
  u.account_reason_text
from public.consumer_users u
left join public.consumer_user_stats s on s.user_id = u.id
left join auth.users au on au.id::text = u.id;

commit;
