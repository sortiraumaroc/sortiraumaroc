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

## Bugs connus en local (non-bloquants)
- `/api/public/home` retourne 500 "Invalid API key" en dev → normal (pas de cles Supabase en local)
- Font Circular Std bloquee par ORB → cosmetique uniquement
