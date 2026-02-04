# 🏪 Établissements Dynamiques par Slug

Votre application supporte maintenant les URLs dynamiques avec des **slugs** pour charger différents établissements.

---

## 📋 Fonctionnement

### Avant (Données Statiques)
```
URL: http://menu.sam.ma/
→ Affiche toujours "Le Petit Braisé" (venueProfile statique)
```

### Maintenant (Dynamique par Slug)
```
URL: http://menu.sam.ma/                  → Établissement par défaut (env var)
URL: http://menu.sam.ma/sur-la-table      → Établissement avec slug "sur-la-table"
URL: http://menu.sam.ma/le-petit-braise   → Établissement avec slug "le-petit-braise"
```

---

## 🏗️ Architecture

### Frontend (React)
**Nouvelle Route**: `/:slug` (voir `client/App.tsx`)
```typescript
<Route path="/" element={<Index />} />        // ← Établissement par défaut
<Route path="/:slug" element={<Index />} />  // ← Établissement par slug (NOUVEAU)
```

**Index.tsx Amélioré** (voir `client/pages/Index.tsx`)
```typescript
const { slug } = useParams();  // Récupère le slug depuis l'URL

// Hook 1: Récupère l'établissement par slug
const { establishment, loading, error } = useEstablishmentBySlug(slug);

// Hook 2: Récupère les menus via le place_id
const { categories, items } = useMySQLMenu(establishment?.placeId);

// Affiche les données dynamiques
<VenueHeader name={establishment.name} ... />
```

**Nouveaux Hooks**:
- `client/hooks/use-establishment-by-slug.ts` → Fetch établissement par slug
- `client/hooks/use-mysql-menu.ts` → Fetch menus par placeId

### Backend (Node.js/Express)
**Nouvelle Route API**: `GET /api/mysql/places/by-slug/:slug`
```
GET http://localhost:8080/api/mysql/places/by-slug/sur-la-table

Réponse:
{
  "placeId": 1,
  "name": "Sur la Table",
  "slug": "sur-la-table",
  "logo": "...",
  "description": "...",
  "address": "...",
  "client": {...}
}
```

---

## 💾 Base de Données - Configuration Requise

### Table `place` - Schéma Prisma
Votre table `place` doit avoir une colonne `slug` (déjà dans le schéma):

```prisma
model Place {
  placeId   Int     @id @map("place_id")
  slug      String? // ← CETTE COLONNE EST ESSENTIELLE!
  name      String
  // ... autres colonnes
}
```

### Vérifier dans phpMyAdmin
```sql
-- Vérifiez que la table place a une colonne slug
SELECT column_name FROM information_schema.columns 
WHERE table_name='place' AND table_schema='sam_site';

-- Ajouter la colonne si elle n'existe pas:
ALTER TABLE place ADD COLUMN slug VARCHAR(255) UNIQUE AFTER name;

-- Remplir les slugs existants:
UPDATE place SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;
```

---

## 🔌 API Endpoints

### 1. Récupérer l'établissement par slug
```
GET /api/mysql/places/by-slug/:slug
```

**Exemple**:
```bash
curl http://89.117.56.191:8080/api/mysql/places/by-slug/sur-la-table
```

**Réponse (200)**:
```json
{
  "placeId": 1,
  "name": "Sur la Table",
  "slug": "sur-la-table",
  "logo": "...",
  "img": "...",
  "description": "...",
  "address": "...",
  "client": {
    "clientId": 1,
    "name": "Client Name",
    "email": "contact@example.com"
  }
}
```

**Erreurs**:
- `404` - Établissement non trouvé
- `500` - Erreur serveur (connexion DB, etc.)

### 2. Récupérer les menus par place_id
```
GET /api/mysql/menu/:placeId
```

**Exemple**:
```bash
curl http://89.117.56.191:8080/api/mysql/menu/1
```

**Réponse (200)**:
```json
{
  "categories": [
    {
      "menuCategoryId": 1,
      "title": "Petit-Déjeuner",
      "menuItems": [...]
    }
  ],
  "items": [
    {
      "menuItemId": 1,
      "title": "Oeufs Brouillés",
      "price": 35
    }
  ]
}
```

---

## 🎯 Flux de Données

```
User accède: http://menu.sam.ma/sur-la-table
          ↓
    URL Parsing: slug = "sur-la-table"
          ↓
  Frontend appelle: GET /api/mysql/places/by-slug/sur-la-table
          ↓
 Backend retourne: { placeId: 1, name: "Sur la Table", ... }
          ↓
  Frontend appelle: GET /api/mysql/menu/1
          ↓
 Backend retourne: { categories: [...], items: [...] }
          ↓
   UI affiche: Header + Menu dynamiques
```

---

## 📋 Implémentation Complète (Checklist)

### Frontend ✅
- [x] Route dynamique `/:slug` ajoutée dans `client/App.tsx`
- [x] Hook `useEstablishmentBySlug()` créé
- [x] Hook `useMySQLMenu()` créé
- [x] Index.tsx amélioré pour charger données dynamiques
- [x] Gestion des erreurs (404 establishment not found)
- [x] Fallback à données par défaut si slug vide

### Backend ✅
- [x] Route API `GET /api/mysql/places/by-slug/:slug` ajoutée
- [x] Erreurs claires (404, 500)
- [x] Relation client incluse dans la réponse

### Base de Données ⏳
- [ ] Colonne `slug` existe dans table `place`
- [ ] Slugs remplis pour les établissements existants
- [ ] Index unique sur `slug` (optionnel mais recommandé)

---

## 🚀 Déploiement sur Plesk

### 1. Ajouter les Colonnes de Slug (si pas déjà fait)
```sql
-- SSH/Plesk Terminal ou phpMyAdmin
ALTER TABLE place ADD COLUMN slug VARCHAR(255) UNIQUE AFTER name;
UPDATE place SET slug = LOWER(REPLACE(REPLACE(name, ' ', '-'), 'é', 'e'));
```

### 2. Déployer le Code
- Uploadez les nouveaux fichiers:
  - `client/hooks/use-establishment-by-slug.ts`
  - `client/hooks/use-mysql-menu.ts`
  - `server/routes/mysql-api.ts` (modifié)
  - `client/App.tsx` (modifié)
  - `client/pages/Index.tsx` (modifié)

### 3. Redémarrer Node.js
```
Panel Plesk → Node.js → Restart
```

### 4. Tester
```bash
# Via curl ou navigateur:
https://votre-domaine.com/sur-la-table
```

---

## 🧪 Tester Localement

### 1. Via le Navigateur
```
http://localhost:8080/                 # Établissement par défaut
http://localhost:8080/sur-la-table     # Établissement avec slug (404 sans BD)
```

### 2. Via l'API Directement
```bash
# Si MySQL est joignable:
curl http://localhost:8080/api/mysql/places/by-slug/sur-la-table

# Si MySQL n'est pas joignable:
# Erreur: "Failed to fetch establishment"
```

### 3. Activer les Logs (Node.js)
```typescript
// Dans server/routes/mysql-api.ts, ajoutez:
console.log("Fetching place by slug:", slug);
console.error("Error fetching place by slug:", error);
```

---

## 🔒 Sécurité

### Validations Implémentées
- ✅ Slug URL-encodé: `encodeURIComponent(slug)`
- ✅ Pas d'injection SQL: Prisma échappe automatiquement
- ✅ Gestion des erreurs: 404 si non trouvé

### À Ajouter (Optionnel)
- Rate limiting sur `/api/mysql/places/by-slug/*`
- Caching des établissements (Redis)
- Whitelist des slugs autorisés

---

## 📊 Exemple: Voir les Slugs dans la DB

```sql
-- Afficher tous les établissements et leurs slugs
SELECT place_id, name, slug FROM place LIMIT 10;

-- Chercher un établissement par slug
SELECT * FROM place WHERE slug = 'sur-la-table' LIMIT 1;

-- Compter les slugs manquants
SELECT COUNT(*) FROM place WHERE slug IS NULL;
```

---

## ✨ Prochaines Étapes (Optionnel)

### 1. Ajouter Caching
```typescript
// Redis cache des établissements
const cacheKey = `establishment:${slug}`;
const cached = await redis.get(cacheKey);
if (cached) return cached;
// ... fetch from DB
await redis.set(cacheKey, establishment, "EX", 3600);
```

### 2. Ajouter Slugs SEO
```typescript
// Rajouter des métadonnées SEO
<helmet>
  <title>{establishment.name} - Menu</title>
  <meta name="description" content={establishment.description} />
</helmet>
```

### 3. Ajouter Multi-Langue
```typescript
// Support slugs multilingues
/:locale/:slug
```

---

## 📞 Dépannage

### Problème: "Établissement non trouvé" (404)
**Cause**: Le slug n'existe pas dans la base de données

**Solution**:
1. Vérifier la colonne `slug` dans table `place`
2. S'assurer que des slugs sont remplis
3. Tester l'API: `GET /api/mysql/places/by-slug/slug-test`

### Problème: "Failed to fetch establishment" (500)
**Cause**: MySQL n'est pas joignable

**Solution**:
1. Vérifier DATABASE_URL dans .env.local
2. Vérifier que MySQL tourne sur le serveur
3. Tester: `ping 89.117.56.191` (votre serveur Plesk)

### Problème: Page blanche / Pas de menu
**Cause**: Menu API n'a pas de données

**Solution**:
1. Vérifier que des catégories/items existent dans DB
2. Vérifier le placeId correspond à l'établissement
3. Vérifier les logs Vite (`npm run dev`)

---

## 📚 Fichiers Modifiés/Créés

| Fichier | Type | Statut |
|---------|------|--------|
| `client/App.tsx` | Modifié | ✅ Route `/:slug` ajoutée |
| `client/pages/Index.tsx` | Modifié | ✅ Données dynamiques |
| `client/hooks/use-establishment-by-slug.ts` | Créé | ✅ Fetch slug |
| `client/hooks/use-mysql-menu.ts` | Créé | ✅ Fetch menus |
| `server/routes/mysql-api.ts` | Modifié | ✅ Route `/places/by-slug/:slug` |

---

## 🎉 Résumé

Votre application supporte maintenant:
1. ✅ URLs dynamiques par slug: `/sur-la-table`
2. ✅ Chargement dynamique des établissements
3. ✅ Menus MySQL associés au place_id
4. ✅ Gestion des erreurs propres
5. ✅ Fallback aux données par défaut

**C'est prêt pour le déploiement sur Plesk!** 🚀

---

**Date**: 2025
**Compatibilité**: Plesk + Node.js + MySQL

Bonne chance! 💪
