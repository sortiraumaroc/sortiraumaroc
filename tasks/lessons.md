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
