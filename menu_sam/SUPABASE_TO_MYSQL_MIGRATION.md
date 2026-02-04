# Migration Supabase → MySQL (Complete)

## 📊 Status: ✅ BACKEND COMPLETE, Frontend en cours

---

## ✅ Ce Qui a Été Fait

### 1. **Database Schema (Prisma)**
- ✅ Mis à jour pour utiliser tes tables existantes:
  - `admin` (auth superadmin)
  - `client` (auth propriétaires)
  - `place` (établissements)
  - `commandes` (orders)
  - `commandes_products` (order items)
  - `menu_category` & `menu_item` (menu)
  - `city` (villes)
  - `promo_codes` (promotions)

- ✅ Créé 3 nouvelles tables:
  - `qr_tables` (tables QR physiques)
  - `participants` (participants à une commande)
  - `payments` (paiements)

### 2. **Backend API Complète** (`/api/mysql/*`)

#### Orders API
```
GET    /api/mysql/orders/:placeId              # Lister les commandes
GET    /api/mysql/orders/:placeId/:orderId     # Détail d'une commande
POST   /api/mysql/orders                       # Créer une commande
PATCH  /api/mysql/orders/:orderId              # Modifier le statut
```

#### Order Items API
```
GET    /api/mysql/orders/:orderId/items        # Lister les articles
POST   /api/mysql/order-items                  # Ajouter un article
PATCH  /api/mysql/order-items/:itemId          # Modifier un article
DELETE /api/mysql/order-items/:itemId          # Supprimer un article
POST   /api/mysql/orders/:orderId/items/clear  # Effacer ses articles
```

#### Menu API
```
GET    /api/mysql/menu/:placeId                # Catégories du menu
GET    /api/mysql/menu-items/:categoryId       # Articles par catégorie
```

#### Promos API
```
GET    /api/mysql/promos/:placeId              # Codes actifs
POST   /api/mysql/promos/validate              # Valider un code
```

#### Participants API
```
POST   /api/mysql/participants                 # Ajouter un participant
```

#### Payments API
```
POST   /api/mysql/payments                     # Créer un paiement
PATCH  /api/mysql/payments/:paymentId          # Modifier le statut
```

### 3. **Authentication API** (`/api/auth/*`)

#### Admin Routes
```
POST   /api/auth/admin/login                   # Connexion admin
POST   /api/auth/admin/logout                  # Déconnexion admin
POST   /api/auth/admin/change-password         # Changer mot de passe
```

#### Client Routes
```
POST   /api/auth/client/login                  # Connexion client
POST   /api/auth/client/logout                 # Déconnexion client
POST   /api/auth/client/change-password        # Changer mot de passe
```

#### Global Routes
```
POST   /api/auth/refresh                       # Rafraîchir le token JWT
POST   /api/auth/verify                        # Vérifier un token
```

### 4. **Frontend Hooks Migrés** (No Supabase!)

#### ✅ use-qr-table-order.ts
- Maintenant utilise `/api/mysql/orders`
- Polling au lieu de Supabase Realtime
- Ajoute automatiquement les participants

#### ✅ use-qr-table-cart.ts
- Utilise `/api/mysql/order-items`
- Polling pour les mises à jour
- Supporte les champs: `quantite`, `prix`, `comment`, `addedBySessionId`

### 5. **SQL Migration Appliquée**
Tous les champs ont été ajoutés à la base de données:
- `admin`: `last_login`, `refresh_token`, `is_active`
- `client`: `last_login`, `refresh_token`, `establishment_id`
- `place`: Champs QR-Table (15+ nouveaux champs)
- `commandes`: QR-Table fields
- `commandes_products`: Tracking des participants

---

## ⏳ À Faire Encore

### 1. **Adapter les Pages d'Auth** (URGENT!)
Ces pages utilisent encore Supabase et doivent être mises à jour:

- [ ] `client/pages/pro/Login.tsx` → Utiliser `/api/auth/client/login`
- [ ] `client/pages/pro/ForcePassword.tsx` → Utiliser `/api/auth/client/change-password`
- [ ] `client/pages/superadmin/Login.tsx` → Utiliser `/api/auth/admin/login`
- [ ] `client/pages/superadmin/ForcePassword.tsx` → Utiliser `/api/auth/admin/change-password`

### 2. **Adapter les Hooks de Session**
- [ ] `client/components/pro/use-pro-session.ts` → Utiliser JWT tokens
- [ ] `client/components/superadmin/use-superadmin-session.ts` → Utiliser JWT tokens

### 3. **Pages Pro** (Inventory & Dashboard)
- [ ] `client/pages/pro/Menu.tsx` → Adapter aux APIs MySQL
- [ ] `client/pages/pro/Tables.tsx` → Adapter à `/api/mysql/orders`
- [ ] `client/pages/pro/Dashboard.tsx` → Adapter au polling au lieu du Realtime

### 4. **Supprimer Supabase Complètement**
- [ ] Supprimer les fichiers:
  - `client/lib/supabase.ts`
  - `client/lib/pro-supabase.ts`
  - `client/lib/supabase-proxy-fetch.ts`
  - `client/lib/superadmin-supabase.ts`
- [ ] Supprimer les imports Supabase dans tous les fichiers

### 5. **Tests Complets**
- [ ] QR-Table: créer une commande
- [ ] QR-Cart: ajouter/retirer des articles
- [ ] Authentication: login/logout
- [ ] Kitchen: recevoir les notifications

---

## 📝 Résumé des Changements de Noms de Champs

### Orders
| Ancien (Supabase) | Nouveau (MySQL) |
|---|---|
| `id` (UUID) | `id` (INT) |
| `establishment_id` | `place_id` |
| `table_number` | `nbrTable` |
| `status` | `status` |
| `kitchen_status` | `kitchen_status` |
| `order_items` | `commandeProducts` |

### Order Items
| Ancien (Supabase) | Nouveau (MySQL) |
|---|---|
| `id` (UUID) | `id` (INT) |
| `order_id` | `commandeId` |
| `product_id` | `menuId` |
| `unit_price` | `prix` |
| `quantity` | `quantite` |
| `note` | `comment` |
| `added_by_session_id` | `addedBySessionId` |
| `added_by_first_name` | `addedByName` |

---

## 🔐 Sécurité - TODO

### ⚠️ IMPORTANT: Cryptage des Mots de Passe
Actuellement, les mots de passe sont stockés en **texte brut** (dangereux!).

À faire avant production:
1. Installer `bcrypt`:
   ```bash
   pnpm add bcrypt
   ```

2. Mettre à jour les endpoints d'auth:
   ```typescript
   import bcrypt from "bcrypt";
   
   // Au login: hash = await bcrypt.hash(password, 10)
   // À la vérification: await bcrypt.compare(password, hashedPassword)
   ```

3. Migrer les mots de passe existants (optionnel mais recommandé)

---

## 🧪 Tester les APIs

### Login Admin
```bash
curl -X POST http://localhost:5173/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

Réponse:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "type": "admin",
    "name": "Admin User"
  }
}
```

### Créer une Commande
```bash
curl -X POST http://localhost:5173/api/mysql/orders \
  -H "Content-Type: application/json" \
  -d '{"placeId":1,"nbrTable":5,"serviceType":"sur_place"}'
```

### Vérifier le Token JWT
```bash
curl -X POST http://localhost:5173/api/auth/verify \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## 📦 Variables d'Environnement Requises

Assurez-vous que ces variables sont définies dans `.env.local`:

```bash
# Database
DATABASE_URL="mysql://root:@localhost:3306/sam_site"

# JWT (à ajouter)
JWT_SECRET="your-super-secret-jwt-key-change-this"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-this"

# Autres
VITE_SUPABASE_URL="https://..." # Peut être supprimé après migration
VITE_SUPABASE_PUBLISHABLE_KEY="..." # Peut être supprimé après migration
```

---

## ✨ Avantages de cette Migration

✅ **Plus de dépendance Supabase** - Économisez les coûts
✅ **Contrôle total** - Base de données locale
✅ **Performance** - Pas de latence réseau
✅ **Sécurité** - Données sensibles locales
✅ **Scalabilité** - MySQL peut supporter millions de requêtes
✅ **Intégration facile** - Prisma ORM rend le code propre

---

## 🚀 Prochaines Étapes

1. Adapter les pages d'authentification
2. Adapter les hooks de session
3. Tester le flow complet
4. Supprimer complètement Supabase
5. Ajouter le cryptage bcrypt
6. Ajouter les tests e2e

---

## 📞 Support

Pour toute question sur la migration:
- Voir les fichiers API: `server/routes/mysql-api.ts` et `server/routes/auth.ts`
- Voir le schéma Prisma: `prisma/schema.prisma`
- Voir les hooks: `client/hooks/use-qr-table-*.ts`
