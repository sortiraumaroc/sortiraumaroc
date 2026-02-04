-- Waitlist auto-expiration and re-promotion
--
-- This migration adds:
-- 1. A function to expire offers and auto-promote the next person in queue
-- 2. Email template for waitlist offer expiration
-- 3. Email template for waitlist auto-promotion notification

begin;

-- ---------------------------------------------------------------------------
-- Function: waitlist_expire_and_promote_all
-- Called by cron job every 5 minutes to:
-- 1. Expire any offer_sent entries past their offer_expires_at
-- 2. Auto-promote the next waiting person for each slot
-- ---------------------------------------------------------------------------
create or replace function public.waitlist_expire_and_promote_all()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_expired_count integer := 0;
  v_promoted_count integer := 0;
  v_entry record;
  v_next record;
  v_new_token text;
  v_new_expires_at timestamptz;
begin
  -- Step 1: Find and expire all offer_sent entries past their deadline
  for v_entry in (
    select we.id, we.slot_id, we.reservation_id, we.user_id, we.position
    from public.waitlist_entries we
    where we.status = 'offer_sent'
      and we.offer_expires_at is not null
      and we.offer_expires_at < now()
    for update skip locked
  )
  loop
    -- Mark as expired
    update public.waitlist_entries
    set
      status = 'offer_expired',
      offer_token = null,
      offer_expires_at = null,
      updated_at = now()
    where id = v_entry.id;

    -- Also mark the associated reservation as cancelled if pending
    update public.reservations
    set
      status = 'cancelled_waitlist_expired',
      cancelled_at = now(),
      updated_at = now()
    where id = v_entry.reservation_id
      and status in ('pending_waitlist', 'pending_pro_validation', 'requested');

    v_expired_count := v_expired_count + 1;

    -- Step 2: Try to promote the next waiting person for this slot
    select we.id, we.reservation_id, we.user_id, we.position
    into v_next
    from public.waitlist_entries we
    where we.slot_id = v_entry.slot_id
      and we.status in ('waiting', 'queued')
    order by we.position asc, we.created_at asc
    limit 1
    for update skip locked;

    if v_next.id is not null then
      -- Generate new offer token and expiry (15 minutes)
      v_new_token := encode(gen_random_bytes(32), 'hex');
      v_new_expires_at := now() + interval '15 minutes';

      -- Update entry to offer_sent
      update public.waitlist_entries
      set
        status = 'offer_sent',
        offer_token = v_new_token,
        offer_expires_at = v_new_expires_at,
        updated_at = now()
      where id = v_next.id;

      -- Update the reservation status
      update public.reservations
      set
        status = 'pending_waitlist',
        updated_at = now()
      where id = v_next.reservation_id;

      v_promoted_count := v_promoted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'expired_count', v_expired_count,
    'promoted_count', v_promoted_count,
    'processed_at', now()
  );
end;
$$;

-- Grant execute to service role
grant execute on function public.waitlist_expire_and_promote_all() to service_role;

-- ---------------------------------------------------------------------------
-- Email templates for waitlist notifications
-- ---------------------------------------------------------------------------
insert into public.email_templates (
  key, audience, name,
  subject_fr, subject_en,
  body_fr, body_en,
  cta_label_fr, cta_label_en,
  cta_url,
  enabled
)
values
  (
    'user_waitlist_offer_expired',
    'consumer',
    'Offre liste d''attente expirée',
    'Votre offre a expiré — {{establishment}}',
    'Your offer has expired — {{establishment}}',
    'Bonjour {{user_name}},

Malheureusement, l''offre de réservation pour {{establishment}} a expiré car elle n''a pas été confirmée à temps.

Date : {{date}}

Si vous êtes toujours intéressé(e), vous pouvez rejoindre à nouveau la liste d''attente.

L''équipe Sortir Au Maroc',
    'Hello {{user_name}},

Unfortunately, the reservation offer for {{establishment}} has expired because it was not confirmed in time.

Date: {{date}}

If you are still interested, you can join the waitlist again.

The Sortir Au Maroc team',
    'Voir l''établissement',
    'View establishment',
    '{{cta_url}}',
    true
  ),
  (
    'user_waitlist_auto_promoted',
    'consumer',
    'Promotion automatique liste d''attente',
    'Bonne nouvelle — une place pour {{establishment}} !',
    'Good news — a spot for {{establishment}}!',
    'Bonjour {{user_name}},

Bonne nouvelle ! Suite au désistement d''un autre client, une place s''est libérée pour {{establishment}}.

Date : {{date}}

Attention : Cette offre expire dans 15 minutes. Confirmez vite !

L''équipe Sortir Au Maroc',
    'Hello {{user_name}},

Good news! Following another customer''s withdrawal, a spot has become available for {{establishment}}.

Date: {{date}}

Note: This offer expires in 15 minutes. Confirm quickly!

The Sortir Au Maroc team',
    'Confirmer maintenant',
    'Confirm now',
    '{{cta_url}}',
    true
  ),
  (
    'pro_waitlist_offer_expired',
    'pro',
    'Notification offre expirée (pro)',
    'Liste d''attente : offre expirée',
    'Waitlist: offer expired',
    'Bonjour,

Une offre de la liste d''attente a expiré pour {{establishment}}.

Date du créneau : {{date}}
Client : {{customer_name}}

Le prochain client en file a été automatiquement notifié.

L''équipe Sortir Au Maroc',
    'Hello,

A waitlist offer has expired for {{establishment}}.

Slot date: {{date}}
Customer: {{customer_name}}

The next customer in queue has been automatically notified.

The Sortir Au Maroc team',
    null,
    null,
    null,
    true
  )
on conflict (key) do nothing;

commit;
