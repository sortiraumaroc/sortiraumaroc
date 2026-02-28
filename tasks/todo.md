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

## Bugs connus en local (non-bloquants)
- `/api/public/home` retourne 500 "Invalid API key" en dev → normal (pas de cles Supabase en local)
- Font Circular Std bloquee par ORB → cosmetique uniquement
