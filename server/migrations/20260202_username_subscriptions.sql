-- Username Subscriptions (Monetization for book.sam.ma/:username)
-- Paid annual subscription to use the personalized booking link feature
-- Includes 14-day free trial

BEGIN;

-- ---------------------------------------------------------------------------
-- Table: username_subscriptions
-- Tracks subscription lifecycle (trial, active, grace_period, expired)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.username_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  visibility_order_id uuid REFERENCES public.visibility_orders(id) ON DELETE SET NULL,

  -- Status flow: trial -> active (after payment) -> grace_period (after expiry) -> expired
  -- Or: trial -> expired (if not converted)
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'pending', 'active', 'grace_period', 'expired', 'cancelled')),

  -- Trial tracking
  is_trial boolean NOT NULL DEFAULT false,
  trial_ends_at timestamptz NULL,

  -- Paid subscription dates
  starts_at timestamptz NULL,
  expires_at timestamptz NULL,
  grace_period_ends_at timestamptz NULL,  -- expires_at + 90 days

  -- Reminder tracking (array of ISO dates when reminders were sent)
  renewal_reminder_sent_at jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Cancellation (stops reminders but keeps access until expiration)
  cancelled_at timestamptz NULL,
  cancelled_by uuid NULL,

  -- Pricing snapshot (0 for trial)
  price_cents int NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MAD',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Constraint: only one active/trial/pending subscription per establishment
CREATE UNIQUE INDEX IF NOT EXISTS idx_username_subscriptions_active_unique
  ON public.username_subscriptions(establishment_id)
  WHERE status IN ('trial', 'pending', 'active', 'grace_period');

-- Index for cron job queries (finding expiring/expired subscriptions)
CREATE INDEX IF NOT EXISTS idx_username_subscriptions_status_expires
  ON public.username_subscriptions(status, expires_at)
  WHERE status IN ('active', 'grace_period');

CREATE INDEX IF NOT EXISTS idx_username_subscriptions_trial_ends
  ON public.username_subscriptions(trial_ends_at)
  WHERE status = 'trial' AND trial_ends_at IS NOT NULL;

-- Index for establishment lookups
CREATE INDEX IF NOT EXISTS idx_username_subscriptions_establishment
  ON public.username_subscriptions(establishment_id);

-- Trigger for updated_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    AND proname = 'set_updated_at'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_username_subscriptions_updated_at') THEN
      CREATE TRIGGER trg_username_subscriptions_updated_at
      BEFORE UPDATE ON public.username_subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Function: Check if establishment has valid username subscription access
-- Returns true if: active subscription OR active trial OR in grace period
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_username_subscription_active(p_establishment_id uuid)
RETURNS boolean AS $$
DECLARE
  sub record;
BEGIN
  SELECT * INTO sub
  FROM public.username_subscriptions
  WHERE establishment_id = p_establishment_id
    AND status IN ('trial', 'active', 'grace_period')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check trial validity
  IF sub.status = 'trial' THEN
    RETURN sub.trial_ends_at IS NULL OR sub.trial_ends_at > now();
  END IF;

  -- Active subscription
  IF sub.status = 'active' THEN
    RETURN sub.expires_at IS NULL OR sub.expires_at > now();
  END IF;

  -- Grace period (link disabled but username reserved)
  IF sub.status = 'grace_period' THEN
    RETURN false;  -- Access denied but username still reserved
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Function: Check if username is reserved (even during grace period)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_username_reserved(p_establishment_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.username_subscriptions
    WHERE establishment_id = p_establishment_id
      AND status IN ('trial', 'active', 'grace_period')
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Extend visibility_offers type constraint for username_subscription
-- ---------------------------------------------------------------------------
ALTER TABLE public.visibility_offers
  DROP CONSTRAINT IF EXISTS visibility_offers_type_check;

ALTER TABLE public.visibility_offers
  ADD CONSTRAINT visibility_offers_type_check
  CHECK (type IN ('pack', 'option', 'menu_digital', 'media_video', 'username_subscription'));

ALTER TABLE public.visibility_order_items
  DROP CONSTRAINT IF EXISTS visibility_order_items_type_check;

ALTER TABLE public.visibility_order_items
  ADD CONSTRAINT visibility_order_items_type_check
  CHECK (type IN ('pack', 'option', 'menu_digital', 'media_video', 'username_subscription'));

-- ---------------------------------------------------------------------------
-- Seed the Username Subscription offer
-- Price: 2400 DH HT = 240000 centimes, TVA 20% = 2000 bps
-- Duration: 365 days
-- ---------------------------------------------------------------------------
INSERT INTO public.visibility_offers (
  title,
  description,
  type,
  deliverables,
  duration_days,
  price_cents,
  currency,
  allow_quantity,
  tax_rate_bps,
  tax_label,
  active,
  display_order
)
SELECT * FROM (
  VALUES (
    'LIEN PERSONNALISE book.sam.ma',
    'Abonnement annuel au lien de reservation personnalise. Votre propre adresse @votrerestaurant accessible partout.',
    'username_subscription',
    ARRAY[
      'Lien personnalise book.sam.ma/@votrenom',
      'QR Code unique pour vos supports',
      'Reservations sans commission SAM',
      'Suivi des statistiques de reservation',
      'Changement de nom tous les 180 jours'
    ]::text[],
    365,
    240000,
    'MAD',
    false,
    2000,
    'TVA',
    true,
    5
  )
) AS v(
  title,
  description,
  type,
  deliverables,
  duration_days,
  price_cents,
  currency,
  allow_quantity,
  tax_rate_bps,
  tax_label,
  active,
  display_order
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.visibility_offers o
  WHERE o.type = 'username_subscription' AND o.deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- RLS Policies for username_subscriptions
-- ---------------------------------------------------------------------------
ALTER TABLE public.username_subscriptions ENABLE ROW LEVEL SECURITY;

-- Pro users can view their own subscriptions
CREATE POLICY "Pro users can view own username subscriptions"
  ON public.username_subscriptions
  FOR SELECT
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.pro_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Admins can do everything
CREATE POLICY "Admins can manage all username subscriptions"
  ON public.username_subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_profiles
      WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Email templates for subscription lifecycle
-- ---------------------------------------------------------------------------
INSERT INTO public.email_templates (slug, subject, body_html, body_text, variables, is_active)
SELECT * FROM (
  VALUES
    -- Trial started
    (
      'username_trial_started',
      'Bienvenue ! Votre essai gratuit de 14 jours est actif',
      '<h1>Bienvenue {{establishment_name}} !</h1>
<p>Votre essai gratuit du <strong>Lien Personnalise</strong> est maintenant actif.</p>
<p>Pendant 14 jours, vous pouvez :</p>
<ul>
  <li>Choisir votre @username unique</li>
  <li>Generer votre QR code personnalise</li>
  <li>Recevoir des reservations sans commission</li>
</ul>
<p>Votre essai se termine le <strong>{{trial_ends_at}}</strong>.</p>
<p><a href="{{pro_url}}" style="background:#a3001d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Acceder a mon espace Pro</a></p>',
      'Bienvenue {{establishment_name}} !

Votre essai gratuit du Lien Personnalise est maintenant actif.

Pendant 14 jours, vous pouvez :
- Choisir votre @username unique
- Generer votre QR code personnalise
- Recevoir des reservations sans commission

Votre essai se termine le {{trial_ends_at}}.

Acceder a mon espace Pro : {{pro_url}}',
      '["establishment_name", "trial_ends_at", "pro_url"]'::jsonb,
      true
    ),
    -- Trial reminder (3 days before end)
    (
      'username_trial_reminder_3d',
      'Plus que 3 jours d''essai - Passez a l''abonnement annuel',
      '<h1>{{establishment_name}}, votre essai se termine bientot</h1>
<p>Il ne vous reste que <strong>3 jours</strong> pour profiter de votre lien personnalise.</p>
<p>Pour continuer a recevoir des reservations via <strong>book.sam.ma/@{{username}}</strong>, passez a l''abonnement annuel.</p>
<p><strong>2 400 DH HT/an</strong> (soit 200 DH/mois)</p>
<ul>
  <li>Reservations sans commission</li>
  <li>QR code unique</li>
  <li>Statistiques detaillees</li>
</ul>
<p><a href="{{subscribe_url}}" style="background:#a3001d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Souscrire maintenant</a></p>',
      '{{establishment_name}}, votre essai se termine bientot

Il ne vous reste que 3 jours pour profiter de votre lien personnalise.

Pour continuer a recevoir des reservations via book.sam.ma/@{{username}}, passez a l''abonnement annuel.

2 400 DH HT/an (soit 200 DH/mois)

Souscrire maintenant : {{subscribe_url}}',
      '["establishment_name", "username", "subscribe_url"]'::jsonb,
      true
    ),
    -- Trial ended
    (
      'username_trial_ended',
      'Votre essai est termine - Activez votre abonnement',
      '<h1>{{establishment_name}}, votre essai gratuit est termine</h1>
<p>Votre lien <strong>book.sam.ma/@{{username}}</strong> n''est plus actif.</p>
<p>Bonne nouvelle : votre @username est reserve pendant encore 7 jours.</p>
<p>Souscrivez maintenant pour le reactiver :</p>
<p><a href="{{subscribe_url}}" style="background:#a3001d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Activer mon abonnement (2 400 DH HT/an)</a></p>',
      '{{establishment_name}}, votre essai gratuit est termine

Votre lien book.sam.ma/@{{username}} n''est plus actif.

Bonne nouvelle : votre @username est reserve pendant encore 7 jours.

Souscrivez maintenant pour le reactiver :
{{subscribe_url}}',
      '["establishment_name", "username", "subscribe_url"]'::jsonb,
      true
    ),
    -- Subscription activated
    (
      'username_subscription_activated',
      'Votre abonnement Lien Personnalise est actif !',
      '<h1>Felicitations {{establishment_name}} !</h1>
<p>Votre abonnement au <strong>Lien Personnalise</strong> est maintenant actif.</p>
<p>Votre lien : <strong>book.sam.ma/@{{username}}</strong></p>
<p>Valide jusqu''au : <strong>{{expires_at}}</strong></p>
<p>Vous pouvez des maintenant :</p>
<ul>
  <li>Telecharger votre QR code</li>
  <li>Partager votre lien sur vos reseaux</li>
  <li>Suivre vos statistiques de reservation</li>
</ul>
<p><a href="{{pro_url}}" style="background:#a3001d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Acceder a mon espace Pro</a></p>',
      'Felicitations {{establishment_name}} !

Votre abonnement au Lien Personnalise est maintenant actif.

Votre lien : book.sam.ma/@{{username}}
Valide jusqu''au : {{expires_at}}

Acceder a mon espace Pro : {{pro_url}}',
      '["establishment_name", "username", "expires_at", "pro_url"]'::jsonb,
      true
    ),
    -- Reminder 30 days before expiration
    (
      'username_subscription_reminder_30d',
      'Votre abonnement expire dans 30 jours',
      '<h1>{{establishment_name}}, pensez a renouveler</h1>
<p>Votre abonnement au Lien Personnalise expire le <strong>{{expires_at}}</strong>.</p>
<p>Renouvelez maintenant pour continuer a utiliser <strong>book.sam.ma/@{{username}}</strong>.</p>
<p><a href="{{renew_url}}" style="background:#a3001d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Renouveler mon abonnement</a></p>',
      '{{establishment_name}}, pensez a renouveler

Votre abonnement au Lien Personnalise expire le {{expires_at}}.

Renouvelez maintenant pour continuer a utiliser book.sam.ma/@{{username}}.

Renouveler : {{renew_url}}',
      '["establishment_name", "username", "expires_at", "renew_url"]'::jsonb,
      true
    ),
    -- Reminder 7 days before expiration
    (
      'username_subscription_reminder_7d',
      'URGENT : Votre abonnement expire dans 7 jours',
      '<h1>{{establishment_name}}, il ne reste que 7 jours !</h1>
<p>Votre abonnement au Lien Personnalise expire le <strong>{{expires_at}}</strong>.</p>
<p>Sans renouvellement, votre lien <strong>book.sam.ma/@{{username}}</strong> sera desactive.</p>
<p><a href="{{renew_url}}" style="background:#a3001d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Renouveler maintenant</a></p>',
      '{{establishment_name}}, il ne reste que 7 jours !

Votre abonnement au Lien Personnalise expire le {{expires_at}}.

Sans renouvellement, votre lien book.sam.ma/@{{username}} sera desactive.

Renouveler : {{renew_url}}',
      '["establishment_name", "username", "expires_at", "renew_url"]'::jsonb,
      true
    ),
    -- Subscription expired (grace period starts)
    (
      'username_subscription_expired',
      'Votre abonnement est expire - Lien desactive',
      '<h1>{{establishment_name}}, votre abonnement est expire</h1>
<p>Votre lien <strong>book.sam.ma/@{{username}}</strong> est maintenant desactive.</p>
<p><strong>Bonne nouvelle :</strong> Votre @username est reserve pendant 90 jours.</p>
<p>Renouvelez avant le <strong>{{grace_period_ends_at}}</strong> pour le reactiver.</p>
<p><a href="{{renew_url}}" style="background:#a3001d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Renouveler mon abonnement</a></p>',
      '{{establishment_name}}, votre abonnement est expire

Votre lien book.sam.ma/@{{username}} est maintenant desactive.

Bonne nouvelle : Votre @username est reserve pendant 90 jours.
Renouvelez avant le {{grace_period_ends_at}} pour le reactiver.

Renouveler : {{renew_url}}',
      '["establishment_name", "username", "grace_period_ends_at", "renew_url"]'::jsonb,
      true
    ),
    -- Final reminder (30 days into grace period)
    (
      'username_subscription_final_reminder',
      'DERNIER RAPPEL : Votre @username sera libere dans 60 jours',
      '<h1>{{establishment_name}}, dernier rappel</h1>
<p>Votre @username <strong>{{username}}</strong> sera definitivement libere le <strong>{{grace_period_ends_at}}</strong>.</p>
<p>Apres cette date, il pourra etre reclame par un autre etablissement.</p>
<p><a href="{{renew_url}}" style="background:#a3001d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Reactiver mon abonnement</a></p>',
      '{{establishment_name}}, dernier rappel

Votre @username {{username}} sera definitivement libere le {{grace_period_ends_at}}.

Apres cette date, il pourra etre reclame par un autre etablissement.

Reactiver : {{renew_url}}',
      '["establishment_name", "username", "grace_period_ends_at", "renew_url"]'::jsonb,
      true
    )
) AS v(slug, subject, body_html, body_text, variables, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates t WHERE t.slug = v.slug
);

COMMIT;
