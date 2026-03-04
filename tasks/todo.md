# SAM.ma — Todo

## Session 04/03/2026 — Pages legales, footer, admin content, pro, Sam chatbot, AddEstablishment

### Pages legales & Footer
- [x] Ajouter hero banners aux pages legales (slugs dans `heroSlugs` de ContentPage.tsx)
- [x] Supprimer 3 liens footer : Charte etablissements, Politique de remboursement, Politique anti no-show
- [x] Reorganiser les liens footer : "Espace Prestataires" deplace vers colonne "Professionnels"

### Admin Content Editor
- [x] Fix erreur "Donnees invalides" dans l'editeur de contenu admin (schema Zod — z.union pour les blocks)
- [x] Ajouter bouton de suppression pour les pages de contenu dans l'admin
- [x] Migration SQL : vider `related_links` de la page A propos (`20260304_clear_about_related_links.sql`)

### Page Pro (refonte)
- [x] Rewrite complet de `ProPublicLanding.tsx` : pricing, features, FAQ
- [x] Modification de la logique auth gate dans `ProAuthGate.tsx`
- [x] Nouveau composant partage `DemoRequestDialog.tsx`

### Sam chatbot (corrections)
- [x] Fix bug "Decouvre-les en swipant" sans cartes restaurant affichees
- [x] Cause racine : GPT hallucine "swipe" quand l'outil retourne 0 resultats + echecs SSE
- [x] Server fix : Execution parallele des outils avec `Promise.all`, prefixe compteur de resultats pour guider GPT (`"AUCUN RESULTAT"`)
- [x] Client fix : Ajout champs `toolHint` et `toolsCalled` a SamMessage, hints de chargement contextuels, fallback UI pour cartes manquantes
- [x] Chatbot plus fluide/reactif grace a l'execution parallele et aux hints contextuels

### Page AddEstablishment (UI)
- [x] Fix visibilite texte sur dark theme : `bg-white text-slate-950`
- [x] Retirer `max-w-2xl` de la photo hero pour alignement avec les stat cards
- [x] Masquer le CTA hero sur desktop (`lg:hidden`), garde sur mobile
- [x] Reduire taille sous-titre : `md:text-lg` → `md:text-base`
- [x] Supprimer le badge "Visibilite + reservations toute l'annee" (icone Sparkles)
- [x] Renommer "Pourquoi Sortir Au Maroc" → "Pourquoi SAM.ma"
- [x] Raccourcir le sous-titre : retirer le prefixe "Une structure simple :"
- [x] Augmenter tailles SectionTitle : kicker `text-xs` → `text-sm`, h2 `text-2xl md:text-3xl` → `text-3xl md:text-4xl`
- [x] Remplacer icone QrCode par Briefcase sur le header du formulaire

### AddEstablishmentLeadForm (compact mode)
- [x] Ajouter prop `compact` pour hauteur reduite
- [x] Mode compact : inputs h-10, spacing space-y-3, field gaps space-y-1, button h-10
- [x] Padding formulaire reduit : `p-5 md:p-6` → `p-4 md:p-5`, `mt-5` → `mt-3`

### Fichiers modifies (non commites)
- `client/pages/AddEstablishment.tsx`
- `client/components/marketing/AddEstablishmentLeadForm.tsx`
- `client/hooks/useSam.ts`
- `client/components/sam/SamMessageBubble.tsx`
- `server/sam/chatEndpoint.ts`
- `client/components/pro/ProPublicLanding.tsx`
- `client/components/pro/ProAuthGate.tsx`
- `client/components/DemoRequestDialog.tsx`
- `client/components/Footer.tsx`
- `client/pages/ContentPage.tsx`
- `server/schemas/adminContent.ts`
- `server/routes/adminContent.ts`
- `server/routes/admin.ts`
- `client/lib/adminApi.ts`
- `client/pages/admin/AdminContentPage.tsx`
- `server/migrations/20260304_clear_about_related_links.sql`

---

## Historique

### Deploiement Hardening Phases 17-20 (fait)
- [x] Phase 17 : Retrait `.passthrough()` de tous les schemas Zod
- [x] Phase 18 : Rate limiting sur routes sensibles
- [x] Phase 19 : `zQuery()` sur toutes les routes GET + fix `Object.defineProperty`
- [x] Phase 20 : `zParams()` sur toutes les routes parametrees (218 routes, 33 fichiers)
- [x] Supabase Security Advisor : 0 errors, 0 warnings (RLS + search_path)
- [x] Fix 5 bugs runtime post-refactoring (imports manquants, noms handlers, req.query getter)
- [x] Build local OK (`pnpm run build`)

### A faire (production — hardening)
- [ ] **Deployer `dist/` sur le serveur** : uploader `dist/server/node-build.mjs` + `dist/spa/` vers `/var/www/vhosts/sam.ma/httpdocs/dist/`
- [ ] **Redemarrer Node.js** dans Plesk : Websites & Domains → sam.ma → Node.js → Restart App
- [ ] **Verifier Sentry** : confirmer 0 nouvelles erreurs `TypeError` et `ReferenceError`
- [ ] **Tester Apple Sign-In** : si toujours en echec apres deploiement, investiguer config OAuth dans Supabase dashboard

### Corrections post-verification parcours client (24/02/2026) (fait)
- [x] Fix AuthWeakPasswordError
- [x] Fix PUBLIC_BASE_URL centralise
- [x] Fix DialogTitle AuthModalV2
- [x] Fix Ramadan 400 slugs
- [x] Fix Codes verification en DB
- [x] Fix Images categories (fallback onError)
- [x] Verification parcours client complete

## Bugs connus en local (non-bloquants)
- `/api/public/home` retourne 500 "Invalid API key" en dev → normal (pas de cles Supabase en local)
- Font Circular Std bloquee par ORB → cosmetique uniquement
