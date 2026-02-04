# Adaptation des Pages PRO: Supabase → MySQL

## ✅ Ce qui a été fait

### Authentication (100% COMPLETE)
- ✅ `use-auth.ts` - Hook JWT réutilisable
- ✅ `pro/Login.tsx` - Utilise `/api/auth/client/login`
- ✅ `pro/ForcePassword.tsx` - Utilise `/api/auth/client/change-password`
- ✅ `superadmin/Login.tsx` - Utilise `/api/auth/admin/login`
- ✅ `superadmin/ForcePassword.tsx` - Utilise `/api/auth/admin/change-password`
- ✅ `use-pro-session.ts` - Utilise JWT tokens au lieu de Supabase
- ✅ `use-superadmin-session.ts` - Utilise JWT tokens au lieu de Supabase

### Hooks (100% COMPLETE)
- ✅ `use-qr-table-order.ts` - Utilise `/api/mysql/orders` avec polling
- ✅ `use-qr-table-cart.ts` - Utilise `/api/mysql/order-items` avec polling

### API Backend (100% COMPLETE)
- ✅ `/api/mysql/orders/*` - CRUD complet
- ✅ `/api/mysql/order-items/*` - Gestion des articles
- ✅ `/api/mysql/menu/*` - Catégories et articles
- ✅ `/api/mysql/promos/*` - Codes de réduction
- ✅ `/api/mysql/participants/*` - Participants
- ✅ `/api/mysql/payments/*` - Paiements
- ✅ `/api/auth/*` - Authentification JWT avec bcrypt

---

## ⏳ À Faire: Pages PRO Complexes

### 1️⃣ `client/pages/pro/Menu.tsx` (Gestion du Menu)

**Utilise actuellement:**
```typescript
// Supabase calls like:
const catRes = await supabase.from("pro_inventory_categories").select(...)
const itemRes = await supabase.from("pro_inventory_items").insert(...)
```

**À adapter vers:**
```typescript
// MySQL API calls like:
const menuRes = await fetch(`/api/mysql/menu/${placeId}`)
const categoriesRes = await fetch(`/api/mysql/menu-items/${categoryId}`)
```

**Étapes d'adaptation:**
1. Remplacer `getProSupabaseClient()` par `useAuthToken("client")`
2. Remplacer les appels Supabase `.from()` par des `fetch()` vers `/api/mysql/*`
3. Adapter les noms de champs:
   - Supabase: `id`, `menu_category` → MySQL: `menuCategoryId`, `menuCategory`
   - Supabase: `price` → MySQL: `price` (compatible)
   - Supabase: `title` → MySQL: `title` (compatible)

**Endpoints à utiliser:**
```
GET  /api/mysql/menu/:placeId
GET  /api/mysql/menu-items/:categoryId
POST /api/mysql/menu (NEW - à créer si nécessaire)
```

---

### 2️⃣ `client/pages/pro/Tables.tsx` (Gestion des QR Tables)

**Utilise actuellement:**
```typescript
const tablesRes = await supabase.from("qr_tables").select(...)
const ordersRes = await supabase.from("qr_table_orders").select(...)
```

**À adapter vers:**
```typescript
const placeRes = await fetch(`/api/mysql/places/${placeId}`)
const ordersRes = await fetch(`/api/mysql/orders/${placeId}`)
```

**Étapes d'adaptation:**
1. Utiliser `/api/mysql/orders/:placeId` pour lister les commandes
2. Créer un nouvel endpoint `/api/mysql/qr-tables/:placeId` pour lister les QR tables
3. Adapter les noms de champs:
   - `establishment_id` → `placeId`
   - `table_number` → `nbrTable`
   - `join_code` → `joinCode`

**Endpoints à ajouter:**
```
GET  /api/mysql/qr-tables/:placeId          # Lister les tables QR
POST /api/mysql/qr-tables                   # Créer une table QR
PATCH /api/mysql/qr-tables/:tableId         # Modifier une table QR
DELETE /api/mysql/qr-tables/:tableId        # Supprimer une table QR
```

---

### 3️⃣ `client/pages/pro/Dashboard.tsx` (Tableau de Bord)

**Utilise actuellement:**
```typescript
const channel = supabase
  .channel(`pro_qr_orders_${establishmentId}`)
  .on("postgres_changes", ...)
  .subscribe()
```

**À adapter vers:**
```typescript
// Polling ou WebSocket
setInterval(async () => {
  const orders = await fetch(`/api/mysql/orders/${establishmentId}`)
  // Update state
}, 2000)  // Poll every 2 seconds
```

**Étapes d'adaptation:**
1. Remplacer Supabase Realtime par polling avec `setInterval`
2. Utiliser `/api/mysql/orders/:placeId` pour lister les commandes
3. Adapter les noms de champs (même que Tables.tsx)

---

## 📝 Template d'Adaptation Générique

### Avant (Supabase)
```typescript
import { getProSupabaseClient } from "@/lib/pro-supabase";

function MyComponent() {
  const supabase = React.useMemo(() => getProSupabaseClient(), []);
  const [data, setData] = React.useState([]);

  React.useEffect(() => {
    async function load() {
      const res = await supabase.from("table_name").select(...);
      setData(res.data || []);
    }
    void load();
  }, [supabase]);
}
```

### Après (MySQL)
```typescript
import { useAuthToken } from "@/hooks/use-auth";

function MyComponent() {
  const accessToken = useAuthToken("client");
  const [data, setData] = React.useState([]);

  React.useEffect(() => {
    async function load() {
      const res = await fetch("/api/mysql/endpoint", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setData(await res.json());
    }
    if (accessToken) void load();
  }, [accessToken]);
}
```

---

## 🔑 Points Importants

### 1. Authentification
- Remplacer `getProSupabaseClient()` par `useAuthToken("client")`
- Remplacer `getSupabaseClient()` par `useAuthToken("client")`
- Ajouter le header `Authorization: Bearer ${token}` à chaque fetch

### 2. Noms de Champs
| Supabase | MySQL |
|----------|-------|
| `id` (UUID) | `id` (INT) |
| `establishment_id` | `placeId` |
| `table_number` | `nbrTable` |
| `order_id` | `commandeId` |
| `product_id` | `menuId` |
| `unit_price` | `prix` |
| `quantity` | `quantite` |

### 3. Real-time → Polling
- **Avant:** Supabase Realtime (WebSocket)
- **Après:** Polling avec `setInterval` (2 secondes)
- C'est moins performant mais suffisant pour une première version

### 4. Gestion d'Erreurs
```typescript
if (!res.ok) {
  const error = await res.json();
  toast.error(error.error || "Failed");
  return;
}
```

---

## 📚 Fichiers à Modifier

| Fichier | État | Notes |
|---------|------|-------|
| `client/pages/pro/Menu.tsx` | À faire | Gestion du menu (INSERT/UPDATE/DELETE) |
| `client/pages/pro/Tables.tsx` | À faire | Gestion des QR tables |
| `client/pages/pro/Dashboard.tsx` | À faire | Tableau de bord en temps réel |
| `client/lib/supabase.ts` | À supprimer | Utilitaire Supabase |
| `client/lib/pro-supabase.ts` | À supprimer | Utilitaire Supabase PRO |
| `client/lib/superadmin-supabase.ts` | À supprimer | Utilitaire Supabase SUPERADMIN |
| `client/lib/supabase-proxy-fetch.ts` | À supprimer | Proxy Supabase |

---

## 🚀 Ordre d'Adaptation Recommandé

1. **Menu.tsx** - Facile, pas de real-time
2. **Tables.tsx** - Moyen, gestion des QR tables
3. **Dashboard.tsx** - Plus complexe, polling en temps réel
4. **Supprimer Supabase** - Nettoyage final

---

## ✨ Endpoints Manquants à Créer

Ajouter à `server/routes/mysql-api.ts`:

### QR Tables Management
```typescript
// GET all QR tables for a place
mysqlApiRouter.get("/qr-tables/:placeId", ...)

// CREATE a new QR table
mysqlApiRouter.post("/qr-tables", ...)

// UPDATE a QR table
mysqlApiRouter.patch("/qr-tables/:tableId", ...)

// DELETE a QR table
mysqlApiRouter.delete("/qr-tables/:tableId", ...)
```

### Menu Management (if needed for PRO to edit)
```typescript
// CREATE a menu category
mysqlApiRouter.post("/menu-categories", ...)

// UPDATE a menu category
mysqlApiRouter.patch("/menu-categories/:categoryId", ...)

// DELETE a menu category
mysqlApiRouter.delete("/menu-categories/:categoryId", ...)

// CREATE a menu item
mysqlApiRouter.post("/menu-items", ...)

// UPDATE a menu item
mysqlApiRouter.patch("/menu-items/:itemId", ...)

// DELETE a menu item
mysqlApiRouter.delete("/menu-items/:itemId", ...)
```

---

## 🧪 Tester Après Adaptation

### 1. Login PRO
```bash
curl -X POST http://localhost:5173/api/auth/client/login \
  -H "Content-Type: application/json" \
  -d '{"email":"contact@lepetitbraise.com","password":"Petitbraise2025!"}'
```

### 2. Récupérer le token et tester une API
```bash
TOKEN="<access_token_from_login>"
curl -X GET http://localhost:5173/api/mysql/menu/1 \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Vérifier la base de données
```sql
SELECT * FROM commandes WHERE place_id = 1;
SELECT * FROM menu_item;
SELECT * FROM qr_tables;
```

---

## 🎯 Checklist Finale

- [ ] Menu.tsx adapté
- [ ] Tables.tsx adapté
- [ ] Dashboard.tsx adapté
- [ ] Tous les tests passent
- [ ] Supabase imports supprimés
- [ ] Base de données fonctionnelle
- [ ] Authentification JWT fonctionnelle
- [ ] Polling/Real-time fonctionnel

---

## 💡 Tips & Tricks

1. **Debugging**: Utilisez `console.error()` pour logger les réponses API
2. **Testing**: Utilisez Postman ou Insomnia pour tester les endpoints
3. **Performance**: Le polling à 2 secondes est OK pour une MVP
4. **Future**: Remplacer le polling par WebSockets pour la production
5. **Security**: Toujours vérifier le status code de la réponse fetch

---

## 📞 Support

Si vous avez besoin d'aide:
1. Lire cette doc complètement
2. Vérifier les exemples de `use-qr-table-order.ts` et `use-qr-table-cart.ts`
3. Créer les endpoints manquants dans `server/routes/mysql-api.ts`
4. Adapter les pages une par une en testant chaque changement
