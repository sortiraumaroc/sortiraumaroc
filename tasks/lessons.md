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

### 8. Service Workers ne peuvent pas utiliser `import.meta.env`
- **Erreur** : `public/firebase-messaging-sw.js` utilisait `self.FIREBASE_API_KEY` — jamais defini
- **Symptome** : Firebase s'initialise avec des strings vides → SW crash → `getToken()` echoue → prompt push jamais affiche
- **Fix** : Plugin Vite `firebase-sw-config` dans `vite.config.ts` qui remplace les placeholders `__FIREBASE_*__` a la volee (middleware dev + `closeBundle` build)
- **Lecon** : Les fichiers dans `public/` sont copies tel quel par Vite — pas de processing. Pour injecter des env vars, il faut un plugin Vite custom.

### 9. Le push prompt ne s'affiche que pour les consommateurs authentifies
- Le composant `PushNotificationPrompt` verifie `isAuthed()` qui check `localStorage.sam_auth === "1"` — uniquement pour les consommateurs
- Les admins et pros utilisent des systemes d'auth separes → le prompt push n'apparait pas dans le panel admin
- Pour tester le push : se connecter comme consommateur sur le site public

### 10. NE JAMAIS modifier search_path de trigger_set_updated_at()
- **Erreur** : `ALTER FUNCTION public.trigger_set_updated_at() SET search_path = 'public'` → chatbot Sam cassé
- **Cause** : Cette fonction trigger est attachée à des dizaines de tables (sam_conversations, sam_messages, etc.). Modifier son search_path provoque des échecs silencieux sur les INSERT/UPDATE
- **Symptôme** : Toutes les requêtes au chatbot retournent "Oups, j'ai eu un petit souci technique" (le catch-all dans chatEndpoint.ts)
- **Fix** : `ALTER FUNCTION public.trigger_set_updated_at() RESET search_path;` — revert immédiat
- **Leçon** : Les fonctions trigger partagées (utilisées par beaucoup de tables) ne doivent JAMAIS être modifiées sans tests exhaustifs. Accepter le warning Security Advisor plutôt que casser la production.

### 11. Toujours tester les API avec les bons noms de champs
- **Erreur** : Test curl avec `sessionId` (camelCase) au lieu de `session_id` (snake_case) → diagnostic erroné
- **Leçon** : Lire le code source pour les noms exacts des champs avant de conclure qu'une API est cassée
