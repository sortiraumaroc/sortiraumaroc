# Plan : Édition & Suppression des Packs (Admin Modération)

## Contexte

La page **Modération Packs** (`/admin/packs-moderation`) permet aux admins d'approuver, rejeter et mettre en avant des packs, mais ne permet **ni de les modifier ni de les supprimer**. L'utilisateur demande ces deux fonctionnalités.

**État actuel :**
- Côté Pro : `PUT /api/pro/packs/:id` et `DELETE /api/pro/packs/:id` existent déjà
- Côté Admin : aucun endpoint d'édition ou suppression
- Le formulaire Pro (`PackCreateForm`) est imbriqué dans `ProPacksDashboard.tsx` et non réutilisable
- La queue de modération ne retourne pas tous les champs (manque `detailed_description`, `inclusions`, `conditions`, dates, etc.)

---

## Plan d'implémentation

### Étape 1 — Backend : 3 nouveaux endpoints admin

**Fichier : `server/routes/packsAdmin.ts`**

1. **`GET /api/admin/packs/:id`** — Récupérer le détail complet d'un pack (tous les champs)
   - `requireAdminKey` + `SELECT *` sur `packs` par ID
   - Retourne toutes les données nécessaires pour pré-remplir le formulaire d'édition

2. **`PUT /api/admin/packs/:id`** — Modifier un pack (admin, sans contrainte de statut)
   - `requireAdminKey` + validation Zod (réutiliser `UpdatePackSchema` de `server/schemas/packsPro.ts`)
   - Appelle une nouvelle fonction `adminUpdatePack()` dans `packLifecycleLogic.ts`
   - Différences vs `updatePackV2` (pro) :
     - Pas de vérification `establishment_id` (l'admin n'est pas propriétaire)
     - Pas de re-soumission en modération (l'admin EST le modérateur)
     - Éditable dans **tous** les statuts (pas seulement draft/active)
   - Audit log : `admin.pack.update`

3. **`DELETE /api/admin/packs/:id`** — Supprimer un pack (admin)
   - `requireAdminKey`
   - Nouvelle fonction `adminDeletePack()` dans `packLifecycleLogic.ts`
   - Vérifie qu'il n'y a pas d'achats non-consommés (`pack_purchases` avec `status` ∈ `[purchased, partially_consumed]`)
   - Si achats actifs → erreur 409 "Impossible de supprimer : X achats actifs"
   - Sinon → `DELETE` du pack
   - Audit log : `admin.pack.delete`

**Fichier : `server/packLifecycleLogic.ts`** — 2 nouvelles fonctions

- `adminUpdatePack(packId, input)` — mise à jour directe, sans ownership check, sans re-modération
- `adminDeletePack(packId)` — suppression avec vérification des achats actifs

### Étape 2 — Frontend API : helpers admin

**Fichier : `client/lib/packsV2AdminApi.ts`** — 3 nouvelles fonctions

```ts
getAdminPack(packId: string): Promise<{ pack: PackV2 }>
updateAdminPack(packId: string, input: Partial<...>): Promise<{ ok: true }>
deleteAdminPack(packId: string): Promise<{ ok: true }>
```

### Étape 3 — Frontend UI : boutons + modal d'édition

**Fichier : `client/components/packs/AdminPacksModerationDashboard.tsx`**

1. **Boutons Modifier / Supprimer** sur chaque `ModerationPackCard` :
   - Icône `Pencil` (modifier) — visible sur tous les packs
   - Icône `Trash2` (supprimer) — visible sur tous les packs
   - Positionnés à côté du bouton chevron expand/collapse

2. **Dialogue de confirmation suppression** :
   - Inline dans la carte (même pattern que le reject/modification)
   - Texte : "Êtes-vous sûr de vouloir supprimer ce pack ?"
   - Bouton rouge "Confirmer la suppression"

3. **Modal d'édition** (`AdminPackEditModal`) :
   - Modal/dialog qui s'ouvre par-dessus la page
   - Au clic sur "Modifier", appel `getAdminPack(id)` pour récupérer toutes les données
   - Formulaire pré-rempli avec les champs principaux :
     - Titre, Prix, Prix barré, Description courte, Description détaillée
     - Stock, Catégorie, Personnes, Limite par client
     - Multi-usage (toggle + nombre)
     - Inclusions / Exclusions (listes dynamiques)
     - Section avancée (dates vente/validité, heures, jours, conditions)
   - Bouton "Enregistrer" → `updateAdminPack(id, data)` → refresh la liste
   - Bouton "Annuler" → ferme le modal

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `server/packLifecycleLogic.ts` | +2 fonctions (`adminUpdatePack`, `adminDeletePack`) |
| `server/routes/packsAdmin.ts` | +3 routes (GET, PUT, DELETE) |
| `server/schemas/packsAdmin.ts` | Réutiliser `UpdatePackSchema` depuis packsPro ou en importer |
| `client/lib/packsV2AdminApi.ts` | +3 fonctions API |
| `client/components/packs/AdminPacksModerationDashboard.tsx` | +boutons, +modal édition, +dialogue suppression |

## Vérification

1. `pnpm run build` — confirmer zéro erreur TS
2. Tester sur le dev server :
   - Ouvrir `/admin/packs-moderation`
   - Vérifier la présence des boutons Modifier/Supprimer sur chaque pack
   - Cliquer Modifier → vérifier que le modal s'ouvre avec les données pré-remplies
   - Modifier un champ → Enregistrer → vérifier la mise à jour
   - Cliquer Supprimer → confirmer → vérifier la disparition du pack
