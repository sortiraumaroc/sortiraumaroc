# Audit du Moteur de Recherche — SAM.ma

**Date** : 6 mars 2026
**Périmètre** : Frontend, Backend, SEO, Sécurité
**Version auditée** : SAM10

---

## Score global estimé : 7.5 / 10

| Dimension | Score | Poids |
|---|---|---|
| Pertinence des résultats | 8/10 | 25% |
| Performance & scalabilité | 7/10 | 20% |
| UX & fonctionnalités | 7/10 | 20% |
| SEO & indexabilité | 9/10 | 15% |
| Sécurité & robustesse | 8/10 | 10% |
| Code & maintenabilité | 6.5/10 | 10% |

---

## Résumé exécutif

Le moteur de recherche SAM.ma est **un système mature et bien architecturé** reposant sur PostgreSQL full-text search (tsvector/tsquery) avec scoring multi-couches, tolérance aux fautes de frappe (pg_trgm), et un pipeline de fallback à 5 niveaux qui garantit zéro résultat vide. Le SEO est excellent (prerendering Puppeteer pour 19+ bots, JSON-LD, hreflang 5 langues, sitemap XML dynamique).

**Points d'attention principaux** : les erreurs API ne sont jamais affichées à l'utilisateur (échec silencieux), les filtres avancés non-restaurant ne sont pas persistés en URL, le fichier `Results.tsx` est monolithique (~3500 lignes), et le rate limiting manque sur l'endpoint de recherche principal.

---

## Points forts

### Architecture backend solide
- **Scoring multi-couches** : PostgreSQL (full-text + trigram + activity + verified/premium/curated + rating) → Personnalisation utilisateur (préférences apprises) → Boosting contextuel (heure/saison/événements)
- **Pipeline de fallback 5 niveaux** : correction typo → expansion synonymes → relaxation filtres → villes proches → populaires — jamais de page blanche
- **200+ synonymes** dans `search_synonyms` couvrant cuisines, concepts, ambiances, régimes
- **Pagination curseur** (keyset) avec fallback offset — performant même sur grands datasets
- **5 requêtes max** par recherche (RPC + count + 2 batch + enrichment) — pas de N+1

### Frontend bien conçu
- **NLP temporel multilingue** : "demain soir pour 4 personnes" → extraction date/heure/personnes en FR/EN/ES/IT
- **Autocomplete avec debounce 300ms** et skeletons de chargement
- **SearchFallback intelligent** : 4 stratégies de récupération avec CTAs contextuels
- **Mobile UX** : modals full-screen, scroll body management, navigation tactile, toggle Liste/Carte
- **Géolocalisation** : "Autour de moi" avec bounding box 5km automatique

### SEO de premier plan
- **Prerendering** Puppeteer pour 19+ bots (Google, Bing, GPTBot, ClaudeBot, PerplexityBot, Applebot...)
- **JSON-LD** complet : Restaurant, LocalBusiness, BreadcrumbList, FAQPage, AggregateRating, GeoCoordinates
- **Hreflang** 5 langues (fr, en, es, it, ar) + x-default
- **Sitemap XML** dynamique : 50K+ URLs avec hreflang
- **llms.txt + llms-full.txt** pour les crawlers IA

### Sécurité robuste
- **Zod validation** sur tous les paramètres de recherche (schemas stricts)
- **Requêtes paramétrées** via Supabase PostgREST — zéro risque d'injection SQL
- **Pas de dangerouslySetInnerHTML** sur les inputs utilisateur
- **Rate limiting** sur les endpoints d'historique de recherche

---

## Problèmes critiques (P0)

### P0-1 : Erreurs API jamais affichées à l'utilisateur

**Impact** : Un utilisateur dont la recherche échoue (réseau, serveur 500) voit une liste vide silencieuse — aucun message d'erreur, aucun bouton retry. Il pense qu'il n'y a aucun résultat.

**Fichier** : `client/pages/Results.tsx`
**Détail** : `apiError` est calculé (ligne ~1343) mais le JSX ne le rend nulle part. `resultsDataEmptyState` est assigné mais non utilisé dans le markup.

**Correction** :
```tsx
// Dans le rendu JSX de Results.tsx, avant le rendu des résultats :
{apiError && !apiLoading && (
  <div className="flex flex-col items-center gap-3 py-12 text-center">
    <AlertCircle className="h-10 w-10 text-red-400" />
    <p className="text-gray-600">
      Une erreur est survenue lors de la recherche.
    </p>
    <Button
      variant="outline"
      onClick={() => refetch()}
      className="gap-2"
    >
      <RefreshCw className="h-4 w-4" /> Réessayer
    </Button>
  </div>
)}
```

### P0-2 : Pas de rate limiting sur l'endpoint de recherche principal

**Impact** : `/api/public/establishments` (endpoint principal) n'a aucun rate limiting. Le cache 120s atténue le risque mais des requêtes uniques (paramètres différents) contournent le cache → vulnérabilité DDoS.

**Fichier** : `server/routes/publicEstablishments.ts`
**Détail** : Seuls les endpoints d'historique ont un rate limiter. Le search principal s'appuie uniquement sur le cache.

**Correction** :
```typescript
// server/routes/publicEstablishments.ts
import { createRateLimiter } from "../middleware/rateLimiter";

const searchRateLimiter = createRateLimiter("search", {
  windowMs: 60 * 1000,
  maxRequests: 100,  // 100 req/min par IP — largement suffisant
  keyGenerator: getClientIp,
});

// Ajouter le middleware avant le handler :
app.get("/api/public/establishments",
  searchRateLimiter,
  zQuery(ListEstablishmentsQuery),
  listPublicEstablishments
);
```

### P0-3 : Pas de longueur max sur le paramètre de recherche `q`

**Impact** : Un attaquant peut envoyer une requête de 100KB+ qui charge le parser `websearch_to_tsquery` de PostgreSQL, augmente la latence RPC, et consomme de la mémoire Puppeteer si la page est prerendue.

**Fichier** : `server/schemas/publicRoutes.ts`
**Détail** : Le champ `q` est `z.string().optional()` sans `.max()`.

**Correction** :
```typescript
// server/schemas/publicRoutes.ts
export const ListEstablishmentsQuery = z.object({
  q: z.string().max(200).optional(),  // 200 chars max
  // ... rest
});

export const SearchAutocompleteQuery = z.object({
  q: z.string().max(200).optional(),
  // ... rest
});
```

---

## Améliorations importantes (P1)

### P1-1 : Double système d'historique non unifié

**Impact** : L'historique localStorage (`searchHistory.ts`, utilisé par `AdaptiveSearchForm`) et l'historique serveur (`publicApi.ts::fetchSearchHistory`, utilisé par `UnifiedSearchInput`) coexistent sans synchronisation. Un utilisateur voit des historiques différents selon le composant.

**Recommandation** : Unifier sur l'historique serveur. Supprimer progressivement `searchHistory.ts` (localStorage) au profit de `fetchSearchHistory` partout.

### P1-2 : Filtres rapides cuisine/ambiance non persistés en URL

**Impact** : `selectedCuisineTypes` et `selectedAmbiances` sont en state React local — perdus au refresh, non partageables par lien, invisibles pour le SEO.

**Fichier** : `client/pages/Results.tsx`
**Recommandation** : Ajouter `cuisines` et `ambiances` comme paramètres URL (format CSV), les lire dans `useSearchParams` au montage.

### P1-3 : Filtres avancés non-restaurant perdus à la navigation

**Impact** : Les filtres loisirs/sport/culture/shopping/hébergement du `FiltersPanel` sont acceptés par le panel mais seuls `restaurantOptions` et `restaurantPriceTier` sont persistés en URL. Les autres sont perdus.

**Fichier** : `client/pages/Results.tsx` (lignes 885-910)
**Recommandation** : Étendre `handleApplyFilters` pour mapper tous les univers → paramètres URL.

### P1-4 : Fichier `Results.tsx` monolithique (~3500 lignes)

**Impact** : Maintenabilité dégradée, temps de compréhension élevé, risque de régression sur chaque modification.

**Recommandation** : Découper en modules :
- `ResultsHeader.tsx` (barre de recherche + filtres rapides)
- `ResultsGrid.tsx` (grille de cartes + pagination)
- `ResultsMap.tsx` (vue carte)
- `useSearchQuery.ts` (hook encapsulant `useInfiniteQuery` + state)
- `useSearchFilters.ts` (hook encapsulant la logique de filtrage)

### P1-5 : Données fictives dans Results.tsx

**Impact** : ~500 lignes de constantes `RESTAURANTS`, `SPORT_WELLNESS`, `LOISIRS`, `HEBERGEMENT`, `CULTURE`, `SHOPPING` (lignes 149-648) ne sont plus utilisées dans l'interface mais gonflent le bundle de ~5KB.

**Correction** : Supprimer ces constantes. Elles ont été remplacées par les données API.

### P1-6 : Suggestions d'activités hardcodées dans `useSuggestions.tsx`

**Impact** : `useActivitySuggestions` retourne des établissements fictifs ("Dar Moha", "Café Arabe", "Le Jardin") qui ne sont pas branchés sur l'API réelle. Si ces établissements ferment ou changent, les suggestions sont obsolètes.

**Recommandation** : Brancher sur `searchAutocomplete` ou `getPopularSearches` avec cache long (5 min).

### P1-7 : Validation géographique manquante pour bounding box

**Impact** : Les paramètres `swLat`, `swLng`, `neLat`, `neLng` acceptent n'importe quel float. Des valeurs hors limites (lat > 90) ne cassent pas la requête mais polluent les résultats.

**Correction** :
```typescript
swLat: z.string().refine(s => {
  const n = Number(s);
  return !isNaN(n) && n >= -90 && n <= 90;
}, "Latitude invalide").optional(),
```

---

## Améliorations souhaitables (P2)

### P2-1 : Navigation clavier incomplète dans l'autocomplete

**Détail** : `ArrowDown/Up` navigue uniquement dans `suggestions` et `popularSearches`. Les `temporalSuggestions` et `recentSearches` sont ignorées par le handler `handleKeyDown`.

**Recommandation** : Unifier toutes les sections de suggestions en un seul tableau indexé pour la navigation clavier.

### P2-2 : Accessibilité ARIA insuffisante dans le dropdown

**Détail** : `role="listbox"` et `role="option"` sont présents, mais il manque : `aria-label` sur le conteneur, `aria-activedescendant` sur l'input, `aria-live` pour les mises à jour dynamiques, `aria-expanded`.

### P2-3 : Pas de support pour dates absolues dans le parser NLP

**Détail** : "le 15 mars" ou "le 2 avril" ne sont pas détectés — seules les expressions relatives ("demain", "ce weekend") fonctionnent.

**Recommandation** : Ajouter des patterns regex pour les dates absolues françaises et étendre le parser.

### P2-4 : État mobile non synchronisé avec desktop

**Détail** : Dans `UnifiedSearchInput`, `inputValue` (desktop) et `mobileSearchInput` (modal mobile) sont deux états séparés. L'utilisateur qui tape en mobile puis ferme la modal perd sa saisie.

### P2-5 : Cache search désactivé par défaut

**Détail** : `CACHE_ENABLED` est `false` par défaut dans `server/lib/cache.ts`. Le cache 120s sur les résultats de recherche ne fonctionne que si explicitement activé. En production, vérifier que cette variable d'environnement est bien activée.

### P2-6 : Expansion de la recherche multilingue FR → EN

**Détail** : Le paramètre `search_lang` utilise `'fr'` par défaut. Un utilisateur francophone qui cherche "breakfast" n'aura pas les mêmes résultats qu'avec "petit-déjeuner" car seul le vecteur français est interrogé.

**Recommandation** : Pour les requêtes sans résultats en français, tenter automatiquement en mode `'both'` (FR + EN).

### P2-7 : Compteur d'amenities non limité

**Détail** : Le paramètre `amenities` (CSV) peut contenir un nombre illimité de valeurs. Ajouter un `.refine(s => s.split(',').length <= 10)` pour borner les combinaisons.

---

## Plan d'action recommandé

### Sprint 1 (urgent, ~2 jours)
| # | Tâche | Effort | Fichiers |
|---|---|---|---|
| P0-1 | Afficher les erreurs API + bouton retry | 1h | Results.tsx |
| P0-3 | Ajouter `.max(200)` sur `q` dans les schemas Zod | 15min | publicRoutes.ts |
| P0-2 | Rate limiter sur `/api/public/establishments` | 30min | publicEstablishments.ts |
| P1-5 | Supprimer les données fictives de Results.tsx | 30min | Results.tsx |

### Sprint 2 (important, ~3 jours)
| # | Tâche | Effort | Fichiers |
|---|---|---|---|
| P1-2 | Persister filtres cuisine/ambiance en URL | 2h | Results.tsx |
| P1-3 | Persister filtres non-restaurant en URL | 3h | Results.tsx, FiltersPanel.tsx |
| P1-7 | Validation géographique bounding box | 30min | publicRoutes.ts |
| P2-7 | Limiter compteur amenities | 15min | publicRoutes.ts |

### Sprint 3 (structurel, ~5 jours)
| # | Tâche | Effort | Fichiers |
|---|---|---|---|
| P1-4 | Refactoring Results.tsx en modules | 3-4j | Nouveaux fichiers + Results.tsx |
| P1-1 | Unifier les systèmes d'historique | 1j | searchHistory.ts, UnifiedSearchInput, AdaptiveSearchForm |
| P1-6 | Brancher suggestions sur API | 1j | useSuggestions.tsx |

### Sprint 4 (polish, ~2 jours)
| # | Tâche | Effort | Fichiers |
|---|---|---|---|
| P2-1 | Navigation clavier complète | 2h | UnifiedSearchInput.tsx |
| P2-2 | Accessibilité ARIA complète | 2h | SearchSuggestionsDropdown.tsx, UnifiedSearchInput.tsx |
| P2-4 | Sync état mobile/desktop | 1h | UnifiedSearchInput.tsx |
| P2-6 | Fallback FR → both en recherche | 1h | searchFallback.ts |

---

## Architecture du moteur de recherche

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (React)                        │
│                                                          │
│  UnifiedSearchInput ──→ searchAutocomplete() ──→ API    │
│       │                                                  │
│  temporalParser ──→ extraction date/time/persons         │
│       │                                                  │
│  Results.tsx ──→ useInfiniteQuery ──→ listPublicEst()   │
│       │              │                                   │
│  FiltersPanel    SearchFallback                           │
│  QuickFilters    (5 stratégies)                          │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP
┌───────────────────────┴─────────────────────────────────┐
│                   SERVEUR (Express)                      │
│                                                          │
│  zQuery(Schema) ──→ Rate Limiter ──→ Cache 120s         │
│       │                                                  │
│  search_establishments_scored() ←── RPC PostgreSQL      │
│       │                                                  │
│  Layer 1: FTS score + trigram + activity + flags         │
│  Layer 2: Personnalisation (user prefs)                  │
│  Layer 3: Contextual boosting (18 règles + événements)  │
│       │                                                  │
│  searchFallback (5 niveaux)                              │
│  synonymExpansion (200+ termes)                          │
│                                                          │
│  Batch: pro_slots + reservations + enrichment            │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────┐
│                  PostgreSQL (Supabase)                    │
│                                                          │
│  search_vector (GIN, French stemming, weighted A-D)     │
│  search_vector_en (GIN, English stemming)                │
│  pg_trgm (trigram similarity, seuil 0.15)               │
│  search_synonyms (200+ mappings)                         │
│  search_suggestions (termes populaires)                  │
│  search_boost_events (boosts temporels)                  │
└─────────────────────────────────────────────────────────┘
```

---

## Métriques de référence

| Métrique | Valeur actuelle |
|---|---|
| Requêtes DB par recherche | 5 max (RPC + count + 2 batch + enrichment) |
| Synonymes configurés | 200+ entrées |
| Langues full-text | 2 (FR, EN) |
| Langues NLP temporel | 4 (FR, EN, ES, IT) |
| Bots prerendering | 19+ user agents |
| Cache résultats | 120s (si CACHE_ENABLED=true) |
| Cache contextual boosts | 30 min |
| Pagination par défaut | 12 items/page (max 50) |
| Threshold trigram | 0.15 (85% overlap) |
| Niveaux de fallback | 5 |
| Boost max contextuel | +50% |
| Boost max personnalisation | +50% |

---

*Rapport généré automatiquement — Audit SAM.ma v10*
