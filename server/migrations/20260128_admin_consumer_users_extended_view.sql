-- Extend admin_consumer_users view with user metadata fields (first_name, last_name, phone)
-- and additional profile fields for complete admin display

begin;

-- Drop and recreate the view to include auth.users metadata
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
  (au.raw_user_meta_data->>'phone')::text as phone,
  u.email,
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
