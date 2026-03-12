# SAM.ma — Todo

## En cours : Deploiement Hardening Phases 17-20

### Fait (local)
- [x] Phase 17 : Retrait `.passthrough()` de tous les schemas Zod
- [x] Phase 18 : Rate limiting sur routes sensibles
- [x] Phase 19 : `zQuery()` sur toutes les routes GET + fix `Object.defineProperty`
- [x] Phase 20 : `zParams()` sur toutes les routes parametrees (218 routes, 33 fichiers)
- [x] Supabase Security Advisor : 0 errors, 0 warnings (RLS + search_path)
- [x] Fix 5 bugs runtime post-refactoring (imports manquants, noms handlers, req.query getter)
- [x] Build local OK (`pnpm run build`)

### A faire (production)
- [ ] **Deployer `dist/` sur le serveur** : uploader `dist/server/node-build.mjs` + `dist/spa/` vers `/var/www/vhosts/sam.ma/httpdocs/dist/`
- [ ] **Redemarrer Node.js** dans Plesk : Websites & Domains → sam.ma → Node.js → Restart App
- [ ] **Verifier Sentry** : confirmer 0 nouvelles erreurs `TypeError` et `ReferenceError`
- [ ] **Tester Apple Sign-In** : si toujours en echec apres deploiement, investiguer config OAuth dans Supabase dashboard

## Corrections post-verification parcours client (24/02/2026)

### Fait
- [x] **Fix AuthWeakPasswordError** : Supabase retourne 422 pour mot de passe pwned → géré côté serveur + client avec traduction 5 langues
- [x] **Fix 1 — PUBLIC_BASE_URL centralisé** : Créé `server/lib/publicBaseUrl.ts`, remplacé 3 fonctions dupliquées + 2 usages inline (6 fichiers modifiés)
- [x] **Fix 2 — DialogTitle AuthModalV2** : Ajouté `<DialogTitle className="sr-only">` avec texte dynamique par étape → 0 warning Radix
- [x] **Fix 3 — Ramadan 400 slugs** : Remplacé validation UUID stricte par `resolveEstablishmentId()` dans `ramadanPublic.ts`
- [x] **Fix 5 — Codes vérification en DB** : Migration SQL appliquée, serveur génère les codes via `crypto.randomInt`, 3 Maps supprimées, rate-limiting en DB
  - Migration : `20260224_email_verification_codes.sql` (2 tables + RLS)
  - Serveur : `emailVerification.ts` réécrit (DB-based)
  - Schema : `code` retiré de `emailSendCodeSchema`
  - Client : `generateVerificationCode()` supprimé, `expectedCode` retiré du state
- [x] **Fix 4 — Images catégories** : Déjà géré (fallback onError dans CategorySelector.tsx)

### Vérification parcours client
- [x] Homepage → Se connecter → AuthModalV2
- [x] Reset password (token + weak password rejection)
- [x] Login email/password
- [x] Onboarding (prénom, nom, DOB 23/09/1980, Maroc, Tanger)
- [x] Persistance profil après logout/login
- [x] QR code affiché (TOTP 30s)
- [x] Booking Steps 1-3 (pré-remplissage OK)

## Checkpoint SAM10 — Améliorations moteur de recherche + Fix push notifications (07/03/2026)

### Audit moteur de recherche (score 7.5/10 → améliorations)
- [x] **S1.1** Affichage erreurs API dans Results.tsx (AlertCircle + RefreshCw + retry)
- [x] **S1.2** `.max(200)` sur le paramètre `q` (ListEstablishmentsQuery + SearchAutocompleteQuery)
- [x] **S1.3** Rate limiter `searchPublicRateLimiter` (60 req/min) sur `/api/public/establishments`
- [x] **S1.4** Ajout `ramadan` au schema Zod ListEstablishmentsQuery
- [x] **S1.5** Clé cache complète (+open_now, instant_booking, amenities, price_range, ramadan)
- [x] **S1.6** Suppression ~500 lignes de données fictives mortes (RESTAURANTS, SPORT_WELLNESS, etc.)
- [x] **S2.1** Filtres cuisine/ambiance persistés en URL (useMemo/useCallback + searchParams)
- [x] **S2.2** Filtres non-restaurant dans handleApplyFilters (loisirs, sport, hébergement, culture, shopping)
- [x] **S2.3** Validation géographique bounding box (lat ∈ [-90,90], lng ∈ [-180,180])
- [x] **S2.4** Limite 15 amenities max (`.refine()`)
- [x] **S3.1** Navigation clavier complète autocomplete (toutes sections : suggestions, recent, popular, temporal)
- [x] **S3.2** Accessibilité ARIA (role=combobox, aria-expanded, aria-controls, role=listbox)
- [x] **S3.3** Sync état mobile/desktop dans UnifiedSearchInput

### Fix push notifications
- [x] **Root cause** : Service Worker `firebase-messaging-sw.js` initialisait Firebase avec des chaînes vides (`self.FIREBASE_*` jamais définis)
- [x] **Fix** : Plugin Vite `firebase-sw-config` dans `vite.config.ts` — remplace les placeholders `__FIREBASE_*__` au build/serve
- [x] **Logging** : Console warnings dans `isPushSupported()` + logs dans `getFCMToken()`
- [x] **Rappel** : Le prompt push n'apparaît que pour les consommateurs connectés sur le site public

### Fichiers modifiés (SAM10)
- `client/pages/Results.tsx` — erreur API, dead code, filtres URL, resetAllPracticalFilters
- `client/components/SearchInputs/UnifiedSearchInput.tsx` — keyboard nav, ARIA, sync mobile
- `client/lib/pushNotifications.ts` — diagnostic logging
- `server/schemas/publicRoutes.ts` — max(200), ramadan, bounds validation, amenities limit
- `server/middleware/rateLimiter.ts` — searchPublicRateLimiter
- `server/routes/public.ts` — rate limiter + cache key
- `vite.config.ts` — plugin firebase-sw-config
- `public/firebase-messaging-sw.js` — placeholders __FIREBASE_*__

## Bugs connus en local (non-bloquants)
- `/api/public/home` retourne 500 "Invalid API key" en dev → normal (pas de cles Supabase en local)
- Font Circular Std bloquee par ORB → cosmetique uniquement
