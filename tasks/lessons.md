# SAM.ma — Lessons Learned

## Patterns & Erreurs a eviter

### 1. Express `req.query` est getter-only en runtime
- **Erreur** : `req.query = parsedValue` → `TypeError: Cannot set property query of #<IncomingMessage> which has only a getter`
- **Fix** : `Object.defineProperty(req, "query", { value: parsed, writable: true, configurable: true })`
- **Lecon** : TypeScript ne detecte PAS ce bug (le cast `as any` contourne le type-check). Seul un test runtime le revele.

### 2. Refactoring de fichiers monolithiques : imports manquants
- **Erreur** : Splitter `public.ts` (11k lignes) en 7 sous-fichiers sans reporter tous les imports
- **Symptome** : `ReferenceError: OCCUPYING_RESERVATION_STATUSES is not defined` en production
- **Pourquoi TypeScript ne l'a pas detecte** : La constante etait utilisee via `OCCUPYING_RESERVATION_STATUSES as unknown as string[]` — le cast `as unknown` supprime la verification de type
- **Lecon** : Apres tout split de fichier, faire un grep exhaustif des symboles utilises vs importes. Tester en runtime.

### 3. Les sub-agents peuvent utiliser des noms de handlers incorrects
- **Erreur** : Lors du wiring de `zParams()`, les sub-agents ont parfois invente des noms de handlers (`listReviewsV2` au lieu de `listAdminReviewsV2`)
- **Symptome** : `ReferenceError: listReviewsV2 is not defined` au demarrage du serveur
- **Lecon** : Toujours verifier que le nom du handler dans la route registration correspond EXACTEMENT a la fonction exportee. Lancer `node dist/server/node-build.mjs` apres chaque batch de modifications.

### 4. Build OK ≠ Runtime OK
- **Regle** : Apres TOUTE modification serveur, tester en runtime :
  ```bash
  pnpm run build
  node dist/server/node-build.mjs  # Doit afficher "Server started"
  curl http://localhost:3000/api/public/home?universe=restaurants  # Doit retourner 200
  ```
- **Pourquoi** : TypeScript verifie les types a la compilation, mais les `ReferenceError`, `TypeError` runtime, et les imports manquants ne sont detectes qu'a l'execution.

### 5. Supabase Security Advisor : verifier apres chaque migration
- **Regle** : Apres toute creation de table ou fonction, verifier le Security Advisor dans le dashboard Supabase
- **Points critiques** : RLS active sur toutes les tables publiques, `SET search_path = ''` sur toutes les fonctions `SECURITY DEFINER`

### 6. Sentry est la source de verite pour les erreurs production
- **Regle** : En cas de 500 en production, toujours consulter Sentry EN PREMIER
- Sentry montre le nom exact de l'exception, la stack trace, et la ligne dans le bundle
- Plus fiable que deviner a partir du code source

### 7. Dev local sans Supabase = erreurs attendues
- En mode dev (`pnpm run dev`), les routes qui font des queries Supabase retournent 500 "Invalid API key"
- C'est NORMAL — ne pas confondre avec un vrai bug
- Pour tester localement avec Supabase : charger les variables d'env manuellement (attention aux guillemets dans .env)

---

## GPT / AI (chatbot Sam)

### 8. GPT ignore les instructions du system prompt — prefixer les resultats d'outil
- **Erreur** : Le system prompt disait "ne dis pas swipe" mais GPT generait quand meme "Decouvre-les en swipant" sans cartes
- **Fix** : Ajouter un prefixe explicite aux resultats d'outil retournes a GPT (ex: `"AUCUN RESULTAT trouvé. Ne propose PAS de swiper."`)
- **Lecon** : Les prefixes dans les `tool results` sont plus fiables que les instructions dans le system prompt seul. GPT suit mieux les contraintes quand elles sont dans le contexte immediat du message.

### 9. Execution parallele des outils ameliore la fluidite du chatbot
- **Pattern** : Utiliser `Promise.all()` pour executer les tool calls GPT en parallele plutot que sequentiellement
- **Impact** : Reduction significative de la latence percue par l'utilisateur
- **Lecon** : Pour tout chatbot avec outils, toujours evaluer si les appels peuvent etre parallelises.

### 10. Toujours prevoir un fallback UI pour les contenus SSE
- **Erreur** : Les cartes restaurant n'apparaissaient pas car le SSE pouvait echouer silencieusement
- **Fix** : Ajouter `toolHint` et `toolsCalled` aux messages pour afficher un indicateur contextuel de chargement et un fallback si les cartes manquent
- **Lecon** : Le SSE n'est pas 100% fiable — toujours prevoir un etat de fallback pour le contenu attendu.

---

## CSS / UI

### 11. Le dark theme rend certaines couleurs de texte invisibles
- **Erreur** : `text-slate-600` sur fond dark → texte invisible
- **Fix** : Forcer `bg-white text-slate-950` sur les pages qui presupposent un fond clair
- **Lecon** : Quand une page est concue pour un fond clair, expliciter le `bg-white` plutot que dependre du defaut.

### 12. `max-w-*` peut desaligner des elements visuellement groupes
- **Erreur** : La photo hero avait `max-w-2xl` alors que les stat cards au-dessus prenaient toute la largeur
- **Fix** : Retirer `max-w-2xl` pour que la photo s'aligne avec les cards
- **Lecon** : Toujours verifier les contraintes `max-w-*` quand des elements doivent etre visuellement alignes.

### 13. Masquer un CTA sur desktop mais le garder sur mobile
- **Pattern** : `lg:hidden` sur le bouton hero pour desktop (le formulaire est visible a cote), garder visible sur mobile (le formulaire est en dessous)
- **Lecon** : Sur les layouts responsives avec sidebar form, le CTA hero est redondant sur desktop mais necessaire sur mobile.

---

## Architecture

### 14. Zod `z.union` pour les schemas flexibles (admin content blocks)
- **Erreur** : `z.object({ type: z.string(), ... })` rejetait les blocks avec des champs extra → "Donnees invalides"
- **Fix** : Utiliser `z.union([richTextBlockSchema, imageBlockSchema, ...])` avec des schemas specifiques par type de block
- **Lecon** : Zod `z.object({})` strip les champs non declares par defaut. Pour les structures polymorphiques, utiliser `z.union` ou `z.discriminatedUnion`.

### 15. Cache middleware : inclure TOUS les query params dans la cle
- **Regle** : `buildCacheKey` doit inclure sort, page, per_page, etc. Sinon des requetes differentes partagent le meme cache.
- **Erreur passee** : Les resultats ramadan etaient identiques quelle que soit la pagination car `page` n'etait pas dans la cle.

---

## Forms

### 16. La compaction de formulaire necessite un tuning iteratif
- **Pattern** : Prop `compact` qui reduit hauteur inputs (h-10), spacing (space-y-3), gaps (space-y-1), button (h-10), padding (p-4)
- **Lecon** : Trop compact → perte d'utilisabilite. Trouver le juste milieu. Tester visuellement a chaque etape.
- **Fichier** : `AddEstablishmentLeadForm.tsx` avec prop `compact`
