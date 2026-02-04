# 🚀 Quick Start Testing

## ✅ Avant de Commencer

1. Vérifier que le serveur démarre: `pnpm run dev`
2. Vérifier que MySQL/XAMPP fonctionne
3. Vérifier que la migration SQL a été exécutée

---

## 🧪 Test 1: Health Check

```bash
curl http://localhost:5173/api/mysql/health
```

**Réponse attendue:**
```json
{
  "status": "ok",
  "database": "mysql",
  "tables": "commandes"
}
```

---

## 🔐 Test 2: Admin Login

```bash
curl -X POST http://localhost:5173/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```

**Réponse attendue:**
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

**Copier le `accessToken` pour les tests suivants:**
```bash
TOKEN="<paste_accessToken_here>"
```

---

## 👤 Test 3: Client Login

```bash
curl -X POST http://localhost:5173/api/auth/client/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "contact@lepetitbraise.com",
    "password": "Petitbraise2025!"
  }'
```

**Réponse attendue:** (Token JWT pour client)

---

## ✔️ Test 4: Verify Token

Utilisez le token d'admin:

```bash
TOKEN="<your_admin_token>"

curl -X POST http://localhost:5173/api/auth/verify \
  -H "Authorization: Bearer $TOKEN"
```

**Réponse attendue:**
```json
{
  "valid": true,
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "type": "admin"
  }
}
```

---

## 🍔 Test 5: Fetch Menu

```bash
TOKEN="<your_token>"

curl -X GET http://localhost:5173/api/mysql/menu/1 \
  -H "Authorization: Bearer $TOKEN"
```

**Réponse attendue:**
```json
[
  {
    "menuCategoryId": 1,
    "placeId": 1,
    "title": "Catégorie",
    "priority": 0,
    ...
  }
]
```

---

## 📦 Test 6: Create Order

```bash
TOKEN="<your_token>"

curl -X POST http://localhost:5173/api/mysql/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "placeId": 1,
    "nbrTable": 5,
    "serviceType": "sur_place"
  }'
```

**Réponse attendue:**
```json
{
  "id": 100,
  "placeId": 1,
  "nbrTable": 5,
  "status": "open",
  "kitchenStatus": "new",
  "joinCode": "ABC123",
  ...
}
```

**Copier l'ID de la commande pour les tests suivants**

---

## 🛒 Test 7: Add Order Item

```bash
TOKEN="<your_token>"
ORDER_ID="<order_id_from_test_6>"

curl -X POST http://localhost:5173/api/mysql/order-items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "commandeId": '$ORDER_ID',
    "menuId": 1,
    "quantite": 2,
    "prix": 150.00,
    "comment": "Sans piment",
    "addedBySessionId": "session_123",
    "addedByName": "Jean"
  }'
```

**Réponse attendue:**
```json
{
  "id": 1,
  "commandeId": 100,
  "menuId": 1,
  "quantite": 2,
  "prix": 150,
  "comment": "Sans piment",
  ...
}
```

---

## 📋 Test 8: List Order Items

```bash
TOKEN="<your_token>"
ORDER_ID="<order_id_from_test_6>"

curl -X GET http://localhost:5173/api/mysql/orders/$ORDER_ID/items \
  -H "Authorization: Bearer $TOKEN"
```

**Réponse attendue:** Liste des articles de la commande

---

## 🏷️ Test 9: Update Order Status

```bash
TOKEN="<your_token>"
ORDER_ID="<order_id_from_test_6>"

curl -X PATCH http://localhost:5173/api/mysql/orders/$ORDER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "status": "locked",
    "kitchenStatus": "preparing"
  }'
```

**Réponse attendue:** Commande mise à jour

---

## 💾 Test 10: Database Verification

Dans phpMyAdmin:

```sql
-- Vérifier les tables
SHOW TABLES;

-- Vérifier les commandes créées
SELECT * FROM commandes WHERE place_id = 1;

-- Vérifier les articles
SELECT * FROM commandes_products WHERE commande_id = 1;

-- Vérifier les participants
SELECT * FROM participants;

-- Vérifier les admins
SELECT * FROM admin;

-- Vérifier les clients
SELECT * FROM client;
```

---

## 🔑 Credentials de Test

### Admin
```
Email: admin@example.com
Password: admin123
```

### Client (PRO)
```
Email: contact@lepetitbraise.com
Password: Petitbraise2025!
```

---

## ⚠️ Dépannage

### Error: "Can't reach database"
```bash
# Vérifier MySQL/XAMPP est en cours d'exécution
# Vérifier DATABASE_URL dans .env.local
# Vérifier les credentials
```

### Error: "Token not found"
```bash
# Vérifier que le token a été copié correctement
# Vérifier le format: Authorization: Bearer <token>
# Vérifier l'espace entre "Bearer" et le token
```

### Error: "Invalid or expired token"
```bash
# Le token a expiré (15 min)
# Re-login pour obtenir un nouveau token
# Ou utiliser le refresh token
```

### Error: "Order not found"
```bash
# Vérifier que l'ORDER_ID est correct
# Vérifier dans la base de données
# Réessayer le test 6 pour créer une nouvelle commande
```

---

## 🎯 Test Complet (En Ordre)

```bash
# 1. Health Check
curl http://localhost:5173/api/mysql/health

# 2. Login Admin
TOKEN=$(curl -s -X POST http://localhost:5173/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')
echo "Token: $TOKEN"

# 3. Verify Token
curl -X POST http://localhost:5173/api/auth/verify \
  -H "Authorization: Bearer $TOKEN"

# 4. Fetch Menu
curl -X GET http://localhost:5173/api/mysql/menu/1 \
  -H "Authorization: Bearer $TOKEN"

# 5. Create Order
ORDER=$(curl -s -X POST http://localhost:5173/api/mysql/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"placeId":1,"nbrTable":5,"serviceType":"sur_place"}' | jq -r '.id')
echo "Order ID: $ORDER"

# 6. Add Item
curl -X POST http://localhost:5173/api/mysql/order-items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"commandeId":'$ORDER',"menuId":1,"quantite":2,"prix":150,"addedBySessionId":"sess_123","addedByName":"Test"}'

# 7. List Items
curl -X GET http://localhost:5173/api/mysql/orders/$ORDER/items \
  -H "Authorization: Bearer $TOKEN"

# 8. Update Status
curl -X PATCH http://localhost:5173/api/mysql/orders/$ORDER \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"locked","kitchenStatus":"preparing"}'

# 9. Logout
curl -X POST http://localhost:5173/api/auth/admin/logout \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🎉 Si Tous les Tests Passent

Vous êtes prêt à:
1. ✅ Adapter les pages PRO
2. ✅ Nettoyer Supabase
3. ✅ Tester complètement l'app
4. ✅ Déployer en production

**Félicitations! 🚀**

---

## 📞 Besoin d'Aide?

1. Lire `MIGRATION_COMPLETE_SUMMARY.md`
2. Lire `SUPABASE_TO_MYSQL_MIGRATION.md`
3. Vérifier les logs: `pnpm run dev`
4. Vérifier phpMyAdmin: `http://localhost/phpmyadmin`
