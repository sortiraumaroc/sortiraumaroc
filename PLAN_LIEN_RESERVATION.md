# Plan d'Implementation : Lien de Reservation Personnalise (book.sam.ma/:username)

## Analyse de l'Existant

### Ce qui existe deja :
1. **Systeme de username** (`20260201_establishment_usernames.sql`):
   - Colonne `username` sur `establishments`
   - Table `establishment_username_requests` pour la moderation
   - Fonctions SQL `check_username_available()` et `validate_username_format()`
   - Politiques RLS configurees

2. **Composant Pro** (`UsernameSection.tsx`):
   - Interface de demande de username
   - Verification de disponibilite en temps reel
   - Partage du lien (actuellement `sam.ma/{username}`)

3. **Redirection** (`UsernameRedirect.tsx`):
   - Route `/@:username` qui redirige vers la fiche etablissement

### Ce qui manque (a developper) :
1. **Tracking de source de reservation** (booking_source, referral_slug)
2. **Sous-domaine book.sam.ma** avec page de reservation dediee
3. **Systeme d'attribution** (cookie 48h)
4. **Calcul conditionnel des commissions**
5. **Reporting par source** dans Admin
6. **Statistiques lien direct** dans Pro

---

## Phase 1 : Schema de Donnees et API de Base

### 1.1 Migration SQL (`20260202_booking_source_tracking.sql`)

```sql
BEGIN;

-- Ajouter les colonnes de tracking de source sur reservations
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booking_source text DEFAULT 'platform'
    CHECK (booking_source IN ('platform', 'direct_link')),
  ADD COLUMN IF NOT EXISTS referral_slug text,
  ADD COLUMN IF NOT EXISTS source_url text;

-- Index pour le reporting par source
CREATE INDEX IF NOT EXISTS idx_reservations_booking_source
  ON public.reservations(booking_source);

CREATE INDEX IF NOT EXISTS idx_reservations_referral_slug
  ON public.reservations(referral_slug)
  WHERE referral_slug IS NOT NULL;

-- Index composite pour les stats par etablissement et source
CREATE INDEX IF NOT EXISTS idx_reservations_establishment_source
  ON public.reservations(establishment_id, booking_source);

-- Commentaires
COMMENT ON COLUMN public.reservations.booking_source IS
  'Source de la reservation: platform (via sam.ma) ou direct_link (via book.sam.ma/:username)';
COMMENT ON COLUMN public.reservations.referral_slug IS
  'Username de l''etablissement si booking_source = direct_link';
COMMENT ON COLUMN public.reservations.source_url IS
  'URL d''origine de la reservation';

COMMIT;
```

### 1.2 Migration SQL - Liste noire de usernames (`20260202_username_blacklist.sql`)

```sql
BEGIN;

-- Table des slugs reserves/interdits
CREATE TABLE IF NOT EXISTS public.username_blacklist (
  slug text PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Inserer les slugs interdits
INSERT INTO public.username_blacklist (slug, reason) VALUES
  ('restaurant', 'Terme generique'),
  ('restaurants', 'Terme generique'),
  ('hotel', 'Terme generique'),
  ('hotels', 'Terme generique'),
  ('spa', 'Terme generique'),
  ('spas', 'Terme generique'),
  ('cafe', 'Terme generique'),
  ('bar', 'Terme generique'),
  ('club', 'Terme generique'),
  ('lounge', 'Terme generique'),
  ('wellness', 'Terme generique'),
  ('loisir', 'Terme generique'),
  ('loisirs', 'Terme generique'),
  ('culture', 'Terme generique'),
  ('marrakech', 'Nom de ville'),
  ('casablanca', 'Nom de ville'),
  ('rabat', 'Nom de ville'),
  ('tanger', 'Nom de ville'),
  ('fes', 'Nom de ville'),
  ('agadir', 'Nom de ville'),
  ('admin', 'Terme reserve'),
  ('api', 'Terme reserve'),
  ('pro', 'Terme reserve'),
  ('sam', 'Terme reserve'),
  ('sortir', 'Terme reserve'),
  ('sortiraumaroc', 'Terme reserve'),
  ('support', 'Terme reserve'),
  ('help', 'Terme reserve'),
  ('contact', 'Terme reserve'),
  ('book', 'Terme reserve'),
  ('booking', 'Terme reserve'),
  ('reserve', 'Terme reserve'),
  ('reservation', 'Terme reserve')
ON CONFLICT (slug) DO NOTHING;

-- Mettre a jour la fonction de verification
CREATE OR REPLACE FUNCTION check_username_available(username_to_check text)
RETURNS boolean AS $$
BEGIN
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

COMMIT;
```

### 1.3 Types TypeScript a ajouter

**Fichier: `client/lib/pro/types.ts`** (ajouter):
```typescript
export type BookingSource = "platform" | "direct_link";

// Extension du type Reservation existant
// Ajouter ces champs au type Reservation:
// booking_source: BookingSource;
// referral_slug: string | null;
// source_url: string | null;
```

**Fichier: `client/lib/bookingAttribution.ts`** (nouveau):
```typescript
// Gestion du cookie d'attribution pour le lien direct
const ATTRIBUTION_COOKIE_NAME = "sam_booking_ref";
const ATTRIBUTION_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 heures

export type BookingAttribution = {
  slug: string;
  establishmentId: string;
  timestamp: number;
  source: "direct_link";
};

export function setBookingAttribution(data: Omit<BookingAttribution, "timestamp" | "source">): void;
export function getBookingAttribution(): BookingAttribution | null;
export function clearBookingAttribution(): void;
export function isAttributionValid(attribution: BookingAttribution, establishmentId: string): boolean;
```

---

## Phase 2 : Page de Reservation book.sam.ma/:slug

### 2.1 Configuration Sous-Domaine

**Option A - Meme application (recommande):**
- Configuration DNS: CNAME `book` → serveur principal
- Detection du sous-domaine dans l'application
- Routage conditionnel base sur `window.location.hostname`

**Option B - Application separee:**
- Micro-frontend dedie (plus complexe, non recommande pour cette phase)

### 2.2 Nouvelle Page (`client/pages/DirectBooking.tsx`)

Structure de la page:
```
┌─────────────────────────────────────────┐
│  Header leger (Logo SAM + Nom etabl.)   │
├─────────────────────────────────────────┤
│                                         │
│  [Cover Image / Galerie]                │
│                                         │
├─────────────────────────────────────────┤
│  Infos essentielles:                    │
│  - Categorie/Universe                   │
│  - Adresse                              │
│  - Horaires                             │
│  - Note moyenne                         │
├─────────────────────────────────────────┤
│                                         │
│  Module de reservation:                 │
│  - Calendrier date                      │
│  - Selection heure/creneau              │
│  - Nombre de personnes                  │
│  - Code promo (optionnel)               │
│  - [Bouton RESERVER]                    │
│                                         │
├─────────────────────────────────────────┤
│  Footer minimal                         │
│  "Propulse par Sortir Au Maroc"         │
└─────────────────────────────────────────┘
```

### 2.3 Composants a creer

1. **`DirectBookingHeader.tsx`** - Header simplifie
2. **`DirectBookingEstablishmentInfo.tsx`** - Infos etablissement condensees
3. **`DirectBookingModule.tsx`** - Module de reservation (reutilise composants existants)
4. **`DirectBookingFooter.tsx`** - Footer minimal

### 2.4 API Route pour resolution du username

**Endpoint**: `GET /api/public/establishments/by-username/:username`

```typescript
// Retourne l'etablissement si username actif
// Pose le cookie d'attribution cote serveur (httpOnly)
{
  establishment: PublicEstablishment;
  attributionSet: boolean;
}
```

---

## Phase 3 : Systeme d'Attribution (Anti-Triche)

### 3.1 Cookie HTTPOnly cote serveur

**Implementation dans `server/routes/public.ts`:**

```typescript
// Middleware pour poser le cookie d'attribution
function setBookingAttributionCookie(res: Response, data: {
  slug: string;
  establishmentId: string;
  timestamp: number;
}) {
  const cookieValue = Buffer.from(JSON.stringify(data)).toString('base64');
  res.cookie('sam_booking_ref', cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 48 * 60 * 60 * 1000, // 48h
    domain: '.sam.ma', // Partage entre sam.ma et book.sam.ma
  });
}

// Middleware pour lire et valider l'attribution
function getBookingAttribution(req: Request): BookingAttribution | null {
  const cookie = req.cookies?.sam_booking_ref;
  if (!cookie) return null;

  try {
    const data = JSON.parse(Buffer.from(cookie, 'base64').toString());
    const now = Date.now();
    if (now - data.timestamp > 48 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}
```

### 3.2 Integration dans creation de reservation

**Modifier `POST /api/consumer/reservations`:**

```typescript
// Au moment de creer la reservation
const attribution = getBookingAttribution(req);

let bookingSource: BookingSource = 'platform';
let referralSlug: string | null = null;
let sourceUrl: string | null = req.headers.referer || null;

// Verifier si l'attribution correspond a l'etablissement
if (attribution && attribution.establishmentId === establishmentId) {
  bookingSource = 'direct_link';
  referralSlug = attribution.slug;
}

// Inclure dans le payload de reservation
const payload = {
  ...existingPayload,
  booking_source: bookingSource,
  referral_slug: referralSlug,
  source_url: sourceUrl,
};
```

### 3.3 Securite Anti-Triche

Regles implementees:
1. Cookie **httpOnly** - non manipulable par JavaScript client
2. Cookie **signe** cote serveur (optionnel, pour plus de securite)
3. **Validation cote serveur** - l'attribution n'est valide que pour l'etablissement specifique
4. **Expiration stricte** de 48h
5. **Pas de query param** - evite la manipulation d'URL

---

## Phase 4 : Calcul Conditionnel des Commissions

### 4.1 Modifier `server/finance/commissions.ts`

```typescript
export async function computeCommissionSnapshotForEstablishment(args: {
  establishmentId: string;
  depositCents: number | null;
  bookingSource?: BookingSource; // NOUVEAU PARAM
}): Promise<CommissionSnapshot> {

  // Si direct_link, pas de commission
  if (args.bookingSource === 'direct_link') {
    return {
      commission_percent: 0,
      commission_amount: 0,
      source: "direct_link_exempt",
    };
  }

  // ... reste du code existant
}
```

### 4.2 Mettre a jour les appels existants

Partout ou `computeCommissionSnapshotForEstablishment` est appele:
- `server/routes/payments.ts`
- `server/finance/escrow.ts`
- Etc.

Passer le `booking_source` de la reservation.

---

## Phase 5 : Interface Pro - Statistiques Lien Direct

### 5.1 Nouveau composant `ProDirectLinkStatsCard.tsx`

Affiche:
- Nombre de reservations via lien direct (jour/semaine/mois)
- Nombre de reservations via plateforme (jour/semaine/mois)
- Graphique comparatif (barres ou camembert)
- Economies realisees (commissions non facturees)
- Taux de conversion

### 5.2 API Endpoint Stats

**Endpoint**: `GET /api/pro/:establishmentId/stats/booking-sources`

```typescript
type BookingSourceStats = {
  period: 'day' | 'week' | 'month' | 'year';
  platformCount: number;
  platformRevenue: number;
  directLinkCount: number;
  directLinkRevenue: number;
  commissionsSaved: number; // Economies grace au lien direct
  conversionRate: number; // Visiteurs lien direct -> reservations
};
```

### 5.3 Ameliorer `UsernameSection.tsx`

Ajouter:
- QR Code genere dynamiquement (utiliser `qrcode.react`)
- Bouton telechargement QR code
- Stats resumees inline

---

## Phase 6 : Interface SuperAdmin - Moderation et Reporting

### 6.1 Page de Moderation des Usernames (`AdminUsernameModerationPage.tsx`)

- Liste des demandes en attente
- Actions: Approuver / Rejeter (avec motif)
- Historique des decisions
- Recherche et filtres

### 6.2 API Endpoints Admin

```typescript
// Liste des demandes en attente
GET /api/admin/username-requests?status=pending

// Approuver une demande
POST /api/admin/username-requests/:id/approve

// Rejeter une demande
POST /api/admin/username-requests/:id/reject
{ reason: string }

// Suspendre un username actif
POST /api/admin/establishments/:id/username/suspend
```

### 6.3 Dashboard Reporting par Source

**Endpoint**: `GET /api/admin/stats/booking-sources`

Filtres:
- Periode (jour, semaine, mois, custom)
- Etablissement specifique
- Categorie/Universe
- Ville

Metriques:
- Total reservations platform vs direct_link
- Commissions generees (platform uniquement)
- Top etablissements par lien direct
- Evolution temporelle

### 6.4 Export CSV/Excel

**Endpoint**: `GET /api/admin/stats/booking-sources/export`

---

## Arborescence des Fichiers a Creer/Modifier

```
server/
├── migrations/
│   ├── 20260202_booking_source_tracking.sql       # NOUVEAU
│   └── 20260202_username_blacklist.sql            # NOUVEAU
├── routes/
│   ├── public.ts                                   # MODIFIER (attribution cookie)
│   ├── admin.ts                                    # MODIFIER (username moderation)
│   └── pro.ts                                      # MODIFIER (stats endpoint)
└── finance/
    └── commissions.ts                              # MODIFIER (exemption direct_link)

client/
├── lib/
│   ├── bookingAttribution.ts                       # NOUVEAU
│   └── pro/types.ts                                # MODIFIER
├── pages/
│   ├── DirectBooking.tsx                           # NOUVEAU
│   └── admin/
│       └── AdminUsernameModerationPage.tsx         # NOUVEAU
├── components/
│   ├── directBooking/
│   │   ├── DirectBookingHeader.tsx                 # NOUVEAU
│   │   ├── DirectBookingEstablishmentInfo.tsx      # NOUVEAU
│   │   ├── DirectBookingModule.tsx                 # NOUVEAU
│   │   └── DirectBookingFooter.tsx                 # NOUVEAU
│   ├── pro/
│   │   ├── UsernameSection.tsx                     # MODIFIER (QR code, stats)
│   │   └── ProDirectLinkStatsCard.tsx              # NOUVEAU
│   └── admin/
│       └── UsernameRequestsPanel.tsx               # NOUVEAU (existe deja?)
└── App.tsx                                          # MODIFIER (routes)
```

---

## Ordre d'Implementation Recommande

### Sprint 1 (Base de donnees + API)
1. [x] Analyser l'existant (FAIT)
2. [ ] Migration `20260202_booking_source_tracking.sql`
3. [ ] Migration `20260202_username_blacklist.sql`
4. [ ] Modifier route de creation reservation (tracking source)
5. [ ] Modifier calcul commissions (exemption direct_link)

### Sprint 2 (Page Direct Booking)
6. [ ] Configurer sous-domaine book.sam.ma
7. [ ] Creer `DirectBooking.tsx` et composants associes
8. [ ] Implementer cookie d'attribution HTTPOnly
9. [ ] Tester flux complet de reservation

### Sprint 3 (Interface Pro)
10. [ ] Endpoint stats booking sources
11. [ ] Composant `ProDirectLinkStatsCard.tsx`
12. [ ] Ameliorer `UsernameSection.tsx` (QR code)

### Sprint 4 (Interface Admin)
13. [ ] Page moderation usernames
14. [ ] Dashboard reporting par source
15. [ ] Export CSV/Excel

### Sprint 5 (Tests et Polish)
16. [ ] Tests E2E du flux complet
17. [ ] Optimisations SEO (meta tags dynamiques)
18. [ ] Documentation API

---

## Points d'Attention Critiques

### Securite
- **JAMAIS** de query param manipulable pour la source
- Cookie **httpOnly** obligatoire
- Validation serveur de l'attribution
- Rate limiting sur verification username

### Performance
- Index sur `booking_source` et `referral_slug`
- Cache des stats (Redis ou in-memory)
- Pagination des listes admin

### UX
- Mobile-first pour la page direct booking
- Temps de chargement < 2s
- Messages d'erreur clairs

### SEO
- Meta tags dynamiques sur book.sam.ma/:username
- Open Graph pour apercu sur reseaux sociaux
- Schema.org pour les etablissements

---

## Questions Ouvertes

1. **Sous-domaine vs Path**: book.sam.ma/:username vs sam.ma/book/:username ?
   - Recommandation: book.sam.ma pour une meilleure separation

2. **Fenetre d'attribution**: 48h est-elle appropriee ?
   - Alternative: 24h ou 72h selon les retours

3. **Statistiques temps reel vs batch**:
   - V1: Calcul a la demande
   - V2: Agregation periodique pour performance

4. **QR Code**: Genere cote client ou serveur ?
   - Recommandation: Client (qrcode.react) pour simplicite

---

*Plan cree le 2026-02-01*
*A valider avant implementation*
