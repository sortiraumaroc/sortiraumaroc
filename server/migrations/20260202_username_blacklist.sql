-- Username Blacklist
-- Table des slugs reserves/interdits pour eviter le username squatting
-- et proteger les termes generiques, noms de villes, et mots reserves

BEGIN;

-- ---------------------------------------------------------------------------
-- Table des slugs reserves/interdits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.username_blacklist (
  slug text PRIMARY KEY,
  reason text NOT NULL,
  category text DEFAULT 'generic',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_username_blacklist_category
  ON public.username_blacklist(category);

COMMENT ON TABLE public.username_blacklist IS
  'Liste des usernames interdits (termes generiques, villes, mots reserves)';

-- ---------------------------------------------------------------------------
-- Inserer les slugs interdits
-- ---------------------------------------------------------------------------

-- Termes generiques (categories)
INSERT INTO public.username_blacklist (slug, reason, category) VALUES
  ('restaurant', 'Terme generique de categorie', 'generic'),
  ('restaurants', 'Terme generique de categorie', 'generic'),
  ('hotel', 'Terme generique de categorie', 'generic'),
  ('hotels', 'Terme generique de categorie', 'generic'),
  ('hebergement', 'Terme generique de categorie', 'generic'),
  ('hebergements', 'Terme generique de categorie', 'generic'),
  ('spa', 'Terme generique de categorie', 'generic'),
  ('spas', 'Terme generique de categorie', 'generic'),
  ('hammam', 'Terme generique de categorie', 'generic'),
  ('hammams', 'Terme generique de categorie', 'generic'),
  ('cafe', 'Terme generique de categorie', 'generic'),
  ('cafes', 'Terme generique de categorie', 'generic'),
  ('bar', 'Terme generique de categorie', 'generic'),
  ('bars', 'Terme generique de categorie', 'generic'),
  ('club', 'Terme generique de categorie', 'generic'),
  ('clubs', 'Terme generique de categorie', 'generic'),
  ('lounge', 'Terme generique de categorie', 'generic'),
  ('lounges', 'Terme generique de categorie', 'generic'),
  ('wellness', 'Terme generique de categorie', 'generic'),
  ('bien.etre', 'Terme generique de categorie', 'generic'),
  ('loisir', 'Terme generique de categorie', 'generic'),
  ('loisirs', 'Terme generique de categorie', 'generic'),
  ('culture', 'Terme generique de categorie', 'generic'),
  ('musee', 'Terme generique de categorie', 'generic'),
  ('musees', 'Terme generique de categorie', 'generic'),
  ('theatre', 'Terme generique de categorie', 'generic'),
  ('cinema', 'Terme generique de categorie', 'generic'),
  ('shopping', 'Terme generique de categorie', 'generic'),
  ('riad', 'Terme generique de categorie', 'generic'),
  ('riads', 'Terme generique de categorie', 'generic'),
  ('kasbah', 'Terme generique de categorie', 'generic'),
  ('kasbahs', 'Terme generique de categorie', 'generic'),
  ('plage', 'Terme generique de categorie', 'generic'),
  ('beach', 'Terme generique de categorie', 'generic'),
  ('piscine', 'Terme generique de categorie', 'generic'),
  ('pool', 'Terme generique de categorie', 'generic')
ON CONFLICT (slug) DO NOTHING;

-- Noms de villes marocaines
INSERT INTO public.username_blacklist (slug, reason, category) VALUES
  ('marrakech', 'Nom de ville', 'city'),
  ('marrakesh', 'Nom de ville', 'city'),
  ('casablanca', 'Nom de ville', 'city'),
  ('casa', 'Nom de ville', 'city'),
  ('rabat', 'Nom de ville', 'city'),
  ('tanger', 'Nom de ville', 'city'),
  ('tangier', 'Nom de ville', 'city'),
  ('fes', 'Nom de ville', 'city'),
  ('fez', 'Nom de ville', 'city'),
  ('agadir', 'Nom de ville', 'city'),
  ('essaouira', 'Nom de ville', 'city'),
  ('ouarzazate', 'Nom de ville', 'city'),
  ('chefchaouen', 'Nom de ville', 'city'),
  ('meknes', 'Nom de ville', 'city'),
  ('oujda', 'Nom de ville', 'city'),
  ('tetouan', 'Nom de ville', 'city'),
  ('kenitra', 'Nom de ville', 'city'),
  ('eljadida', 'Nom de ville', 'city'),
  ('safi', 'Nom de ville', 'city'),
  ('nador', 'Nom de ville', 'city'),
  ('beni.mellal', 'Nom de ville', 'city'),
  ('settat', 'Nom de ville', 'city'),
  ('taza', 'Nom de ville', 'city'),
  ('khouribga', 'Nom de ville', 'city'),
  ('mohammedia', 'Nom de ville', 'city'),
  ('errachidia', 'Nom de ville', 'city'),
  ('ifrane', 'Nom de ville', 'city'),
  ('dakhla', 'Nom de ville', 'city'),
  ('laayoune', 'Nom de ville', 'city'),
  ('taroudant', 'Nom de ville', 'city'),
  ('tamaris', 'Nom de ville', 'city'),
  ('tamuda', 'Nom de ville', 'city'),
  ('assilah', 'Nom de ville', 'city'),
  ('asilah', 'Nom de ville', 'city')
ON CONFLICT (slug) DO NOTHING;

-- Termes reserves (marque, technique, admin)
INSERT INTO public.username_blacklist (slug, reason, category) VALUES
  ('admin', 'Terme reserve', 'reserved'),
  ('administrator', 'Terme reserve', 'reserved'),
  ('api', 'Terme reserve', 'reserved'),
  ('pro', 'Terme reserve', 'reserved'),
  ('sam', 'Terme reserve (marque)', 'reserved'),
  ('sortir', 'Terme reserve (marque)', 'reserved'),
  ('sortiraumaroc', 'Terme reserve (marque)', 'reserved'),
  ('sortir.au.maroc', 'Terme reserve (marque)', 'reserved'),
  ('support', 'Terme reserve', 'reserved'),
  ('help', 'Terme reserve', 'reserved'),
  ('aide', 'Terme reserve', 'reserved'),
  ('contact', 'Terme reserve', 'reserved'),
  ('book', 'Terme reserve', 'reserved'),
  ('booking', 'Terme reserve', 'reserved'),
  ('reserve', 'Terme reserve', 'reserved'),
  ('reservation', 'Terme reserve', 'reserved'),
  ('reservations', 'Terme reserve', 'reserved'),
  ('user', 'Terme reserve', 'reserved'),
  ('users', 'Terme reserve', 'reserved'),
  ('account', 'Terme reserve', 'reserved'),
  ('settings', 'Terme reserve', 'reserved'),
  ('dashboard', 'Terme reserve', 'reserved'),
  ('login', 'Terme reserve', 'reserved'),
  ('logout', 'Terme reserve', 'reserved'),
  ('signin', 'Terme reserve', 'reserved'),
  ('signup', 'Terme reserve', 'reserved'),
  ('register', 'Terme reserve', 'reserved'),
  ('password', 'Terme reserve', 'reserved'),
  ('reset', 'Terme reserve', 'reserved'),
  ('auth', 'Terme reserve', 'reserved'),
  ('oauth', 'Terme reserve', 'reserved'),
  ('callback', 'Terme reserve', 'reserved'),
  ('webhook', 'Terme reserve', 'reserved'),
  ('webhooks', 'Terme reserve', 'reserved'),
  ('test', 'Terme reserve', 'reserved'),
  ('demo', 'Terme reserve', 'reserved'),
  ('official', 'Terme reserve', 'reserved'),
  ('verified', 'Terme reserve', 'reserved'),
  ('morocco', 'Terme reserve', 'reserved'),
  ('maroc', 'Terme reserve', 'reserved'),
  ('root', 'Terme reserve', 'reserved'),
  ('system', 'Terme reserve', 'reserved'),
  ('null', 'Terme reserve', 'reserved'),
  ('undefined', 'Terme reserve', 'reserved'),
  ('www', 'Terme reserve', 'reserved'),
  ('http', 'Terme reserve', 'reserved'),
  ('https', 'Terme reserve', 'reserved'),
  ('ftp', 'Terme reserve', 'reserved'),
  ('mail', 'Terme reserve', 'reserved'),
  ('email', 'Terme reserve', 'reserved'),
  ('blog', 'Terme reserve', 'reserved'),
  ('news', 'Terme reserve', 'reserved'),
  ('status', 'Terme reserve', 'reserved'),
  ('about', 'Terme reserve', 'reserved'),
  ('terms', 'Terme reserve', 'reserved'),
  ('privacy', 'Terme reserve', 'reserved'),
  ('legal', 'Terme reserve', 'reserved'),
  ('faq', 'Terme reserve', 'reserved')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Mettre a jour la fonction de verification de disponibilite
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_username_available(username_to_check text)
RETURNS boolean AS $$
BEGIN
  -- Normaliser en minuscules
  username_to_check := lower(trim(username_to_check));

  -- Verifier la liste noire
  IF EXISTS (
    SELECT 1 FROM public.username_blacklist
    WHERE slug = username_to_check
  ) THEN
    RETURN false;
  END IF;

  -- Verifier si deja pris par un etablissement
  IF EXISTS (
    SELECT 1 FROM public.establishments
    WHERE lower(username) = username_to_check
  ) THEN
    RETURN false;
  END IF;

  -- Verifier si en attente de moderation
  IF EXISTS (
    SELECT 1 FROM public.establishment_username_requests
    WHERE lower(requested_username) = username_to_check
    AND status = 'pending'
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Fonction pour verifier si un slug est dans la blacklist (avec raison)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_username_blacklist_reason(username_to_check text)
RETURNS TABLE (
  is_blacklisted boolean,
  reason text,
  category text
) AS $$
BEGIN
  username_to_check := lower(trim(username_to_check));

  RETURN QUERY
  SELECT
    true::boolean as is_blacklisted,
    b.reason,
    b.category
  FROM public.username_blacklist b
  WHERE b.slug = username_to_check
  LIMIT 1;

  -- Si aucun resultat, retourner false
  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, NULL::text, NULL::text;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_username_blacklist_reason IS
  'Verifie si un username est dans la blacklist et retourne la raison';

-- ---------------------------------------------------------------------------
-- RLS pour la table blacklist (lecture seule pour tous, ecriture admin)
-- ---------------------------------------------------------------------------
ALTER TABLE public.username_blacklist ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire la blacklist
CREATE POLICY "Anyone can read username blacklist"
  ON public.username_blacklist
  FOR SELECT
  USING (true);

-- Seuls les admins peuvent modifier
CREATE POLICY "Admins can manage username blacklist"
  ON public.username_blacklist
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_profiles
      WHERE user_id = auth.uid()
    )
  );

COMMIT;
