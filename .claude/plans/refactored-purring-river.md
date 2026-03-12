# Plan : Intégration offres Ramadan dans le chatbot Sam

## Contexte

Le tool `search_ramadan_offers` existe déjà dans le chatbot Sam (tools.ts, samDataAccess.ts, systemPrompt.ts). Le problème : **le tool fonctionne côté serveur mais les données d'offre sont perdues dans le mapping vers le client**. Les cartes affichées sont des `SamEstablishmentCard` génériques sans prix, horaires, type de formule, ni badge.

### Problèmes identifiés

1. **Données perdues** : le handler (tools.ts:661-691) mappe les offres vers un format `SamEstablishmentItem` minimal (`id, slug, name, city, cover_url, universe, booking_enabled`) — tous les champs offre (prix, horaires, type) sont jetés
2. **Champs établissement manquants** : `google_rating`, `review_count`, `subcategory`, `neighborhood`, `service_types` ne sont pas dans le join Supabase
3. **Déduplication excessive** : `Set<establishment_id>` = si un restaurant a un ftour ET un shour, seul 1 apparaît
4. **Pas de filtrage prix** : impossible de dire "ftour pas cher" ou "budget max 200 MAD"
5. **Pas de carte dédiée** : le client ne montre que `SamEstablishmentCard` — aucune info Ramadan visible

---

## Approche : étendre `SamEstablishmentItem` avec un champ optionnel `ramadan_offer`

Zéro changement au pipeline SSE (chatEndpoint.ts, useSam.ts inchangés). Seuls le type, les données, et le rendu changent.

---

## Étape 1 — Type `SamEstablishmentItem` (client/lib/samApi.ts)

Ajouter un champ optionnel `ramadan_offer?` à l'interface existante :

```typescript
ramadan_offer?: {
  offer_id: string;
  offer_title: string;
  offer_type: string;       // "ftour" | "shour" | "traiteur" | "pack_famille" | "special"
  price: number | null;      // MAD (divisé par 100)
  original_price: number | null;
  service_types: string[] | null;
  time_slots: Array<{ start: string; end: string; label?: string }> | null;
  capacity_per_slot: number | null;
  valid_from: string | null;
  valid_to: string | null;
};
```

Aucun breaking change — le champ est optionnel.

---

## Étape 2 — Enrichir `searchRamadanOffers()` (server/lib/samDataAccess.ts)

### 2a. Ajouter `min_price`, `max_price` à la signature
Valeurs en MAD, converties en centimes pour le filtre DB (`query.gte("price", min_price * 100)`).

### 2b. Enrichir le join Supabase
De : `establishments(id, name, slug, city, cover_url, universe)`
À : `establishments(id, name, slug, city, cover_url, universe, service_types, google_rating, google_review_count, avg_rating, review_count, subcategory, neighborhood, booking_enabled, is_online)`

### 2c. Enrichir `SamRamadanOffer` et le mapping
Ajouter les champs établissement au type et au `.map()`.

### 2d. Tri intelligent
Si `max_price` spécifié → tri par prix ASC. Sinon → shuffle (comportement actuel).

---

## Étape 3 — Enrichir le tool handler (server/sam/tools.ts)

### 3a. Paramètres
Ajouter `max_price` et `min_price` au schéma du tool.

### 3b. Handler
- Passer `min_price`/`max_price` à `searchRamadanOffers()`
- **Supprimer la déduplication** par `establishment_id` — chaque offre = 1 carte
- Mapper TOUS les champs établissement (ratings, subcategory, neighborhood...)
- **Embarquer `ramadan_offer`** avec conversion prix centimes → MAD

---

## Étape 4 — Nouveau composant `SamRamadanOfferCard.tsx`

**Fichier** : `client/components/sam/SamRamadanOfferCard.tsx` (NOUVEAU)

Design :
```
┌─────────────────────────────────────┐
│  [Badge: Buffet à volonté]  [-15%]  │  ← badges sur la cover
│         [PHOTO COVER]               │  ← 140px, fallback 🌙 gradient
├─────────────────────────────────────┤
│  Ftour — Buffet Royal               │  ← type prefix + titre offre
│  📍 Nom · Quartier, Ville           │
│  🕐 18:00–21:00                     │
│  ⭐ 4.5 (230)  ★ 4.2               │
│                                     │
│  420 MAD /pers.  ̶4̶9̶0̶ ̶M̶A̶D̶          │  ← prix doré bold + barré
│  [ Voir l'établissement → ]         │  ← CTA bleu nuit → amber hover
└─────────────────────────────────────┘
```

- **Badge type** : couleurs par type (amber/ftour, indigo/shour, emerald/traiteur, rose/pack_famille, violet/special)
- **Badge service** affiché en priorité si `service_types[0]` existe
- **Bordure** : `border-amber-200/60` (distinction visuelle vs cartes normales)
- **Prix** : `text-amber-600 font-extrabold text-[15px]` + original barré si réduction
- **CTA** : `bg-[#0f1b3d] hover:bg-amber-600`
- Import `RAMADAN_OFFER_TYPE_LABELS` depuis `shared/ramadanTypes.ts`

---

## Étape 5 — Rendu conditionnel (client/components/sam/SamMessageBubble.tsx)

Dans le `.map()` des établissements (ligne ~281), ajouter un branchement :

```tsx
est.ramadan_offer
  ? <SamRamadanOfferCard key={`${est.id}-${est.ramadan_offer.offer_id}`} item={est} />
  : <SamEstablishmentCard key={est.id} item={est} />
```

Key composite pour les cartes Ramadan (même `establishment_id` peut apparaître plusieurs fois).

---

## Étape 6 — System prompt (server/sam/systemPrompt.ts)

Ajouter après les règles Ramadan existantes (ligne ~424) :

```
INTELLIGENCE — BUDGET RAMADAN :
- "pas cher", "économique" → max_price: 200
- "entre 100 et 200" → min_price: 100, max_price: 200
- "haut de gamme", "luxe" → min_price: 300

RÉPONSE RAMADAN — FORMAT :
Les cartes affichent automatiquement : badge, prix, horaires, notes.
Ta réponse texte doit être UNE PHRASE ACCROCHEUSE.
NE LISTE JAMAIS les noms/prix/horaires dans ton texte — les cartes s'en chargent.
```

---

## Fichiers impactés

| Fichier | Action | Étape |
|---------|--------|-------|
| `client/lib/samApi.ts` | MODIFIER (type) | 1 |
| `server/lib/samDataAccess.ts` | MODIFIER (enrichir) | 2 |
| `server/sam/tools.ts` | MODIFIER (params + handler) | 3 |
| `client/components/sam/SamRamadanOfferCard.tsx` | **NOUVEAU** | 4 |
| `client/components/sam/SamMessageBubble.tsx` | MODIFIER (import + condition) | 5 |
| `client/components/sam/index.ts` | MODIFIER (export) | 5 |
| `server/sam/systemPrompt.ts` | MODIFIER (budget + format) | 6 |

**Inchangés** : `chatEndpoint.ts`, `useSam.ts`, `SamEstablishmentCard.tsx`

---

## Vérification

1. **Build** : `pnpm run build` → zéro erreur
2. **Scénario 1** : "Je cherche un ftour à Casablanca" → cartes Ramadan avec prix, horaires, badge
3. **Scénario 2** : "Un buffet ramadan pas cher" → `max_price: 200`, résultats triés par prix
4. **Scénario 3** : "Toutes les offres Ramadan" → mix ftour/shour/traiteur avec cartes dédiées
5. **Scénario 4** : Recherche classique "restaurant italien" → `SamEstablishmentCard` inchangé (pas de régression)
