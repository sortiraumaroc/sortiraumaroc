# Suppression Complète de Supabase

## ⚠️ Avant de Supprimer

1. ✅ Assurez-vous que l'authentification JWT fonctionne
2. ✅ Testez les pages de login et logout
3. ✅ Testez les hooks de session PRO et SUPERADMIN
4. ✅ Testez les commandes QR et panier
5. ✅ Faites un backup de votre base de données

---

## 📋 Fichiers à Supprimer

### 1. Utilitaires Supabase
```bash
rm client/lib/supabase.ts
rm client/lib/pro-supabase.ts
rm client/lib/superadmin-supabase.ts
rm client/lib/supabase-proxy-fetch.ts
```

### 2. Routes Supabase (Backend)
```bash
rm server/routes/supabase-proxy.ts
```

---

## 🔍 Variables d'Environnement à Supprimer

Dans `.env.local`, commentez ou supprimez:
```bash
# À SUPPRIMER:
VITE_SUPABASE_URL="https://ogjghzgzkxxoggocadln.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_ZoyNY8jMN3s5mxZq-gGHQA_dQU4j4Gk"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Garder uniquement:
```bash
# À GARDER:
DATABASE_URL="mysql://root:@localhost:3306/sam_site"
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-key"
```

---

## 🧹 Imports à Supprimer

### Dans `server/index.ts`
```typescript
// ❌ À SUPPRIMER:
import { supabaseProxyRouter } from "./routes/supabase-proxy";
app.use("/api/supabase", supabaseProxyRouter);

// ✅ À GARDER:
import { authRouter } from "./routes/auth";
import { mysqlApiRouter } from "./routes/mysql-api";
app.use("/api/auth", authRouter);
app.use("/api/mysql", mysqlApiRouter);
```

### Dans les fichiers clients
Rechercher et supprimer tous ces imports:
```bash
# Commande pour trouver:
grep -r "from \"@/lib/supabase" client/
grep -r "getSupabaseClient" client/
grep -r "getProSupabaseClient" client/
grep -r "getSuperadminSupabaseClient" client/
```

Puis remplacer par les nouveaux imports:
```typescript
// ❌ Ancien:
import { getProSupabaseClient } from "@/lib/pro-supabase";

// ✅ Nouveau:
import { useAuthToken } from "@/hooks/use-auth";
import { useProSession } from "@/components/pro/use-pro-session";
```

---

## 📦 Dépendances à Supprimer

### Package.json
```bash
pnpm remove @supabase/supabase-js
pnpm remove @supabase/functions-js
```

---

## 🧪 Checklist de Nettoyage

### Supprimer les Fichiers
- [ ] `client/lib/supabase.ts`
- [ ] `client/lib/pro-supabase.ts`
- [ ] `client/lib/superadmin-supabase.ts`
- [ ] `client/lib/supabase-proxy-fetch.ts`
- [ ] `server/routes/supabase-proxy.ts`

### Nettoyer `.env.local`
- [ ] Supprimer `VITE_SUPABASE_URL`
- [ ] Supprimer `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Supprimer `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Ajouter `JWT_SECRET` (si manquant)
- [ ] Ajouter `JWT_REFRESH_SECRET` (si manquant)

### Remplacer les Imports
- [ ] `server/index.ts` - Supprimer supabase proxy router
- [ ] Parcourir tous les fichiers client pour supabase imports
- [ ] Remplacer par les nouveaux hooks JWT

### Tester
- [ ] Vérifier que le serveur démarre sans erreur
- [ ] Tester login admin
- [ ] Tester login client
- [ ] Tester logout
- [ ] Tester les pages protégées
- [ ] Vérifier la base de données fonctionne

---

## ✨ Fichiers à Ajouter/Vérifier

### Doit exister:
- ✅ `client/hooks/use-auth.ts`
- ✅ `server/routes/auth.ts`
- ✅ `server/routes/mysql-api.ts`
- ✅ `client/components/pro/use-pro-session.ts`
- ✅ `client/components/superadmin/use-superadmin-session.ts`

### Pages migrées:
- ✅ `client/pages/pro/Login.tsx`
- ✅ `client/pages/pro/ForcePassword.tsx`
- ✅ `client/pages/superadmin/Login.tsx`
- ✅ `client/pages/superadmin/ForcePassword.tsx`

### Hooks migrés:
- ✅ `client/hooks/use-qr-table-order.ts`
- ✅ `client/hooks/use-qr-table-cart.ts`

---

## 🔐 Variables d'Environnement Finales

Votre `.env.local` doit ressembler à:
```bash
# Database
DATABASE_URL="mysql://root:@localhost:3306/sam_site"

# JWT Authentication
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-this-in-production"

# Vite - SAM
VITE_SAM_ESTABLISHMENT_ID="fa598ae4-b991-4c5f-9fa0-3609302c1ede"

# Bootstrap (si encore utilisé)
PRO_BOOTSTRAP_EMAIL="contact@lepetitbraise.com"
PRO_BOOTSTRAP_PASSWORD="Petitbraise2025!"
```

---

## 🚀 Commandes Rapides pour Nettoyer

```bash
# 1. Supprimer les fichiers Supabase
rm client/lib/supabase.ts client/lib/pro-supabase.ts client/lib/superadmin-supabase.ts client/lib/supabase-proxy-fetch.ts server/routes/supabase-proxy.ts

# 2. Supprimer les dépendances Supabase
pnpm remove @supabase/supabase-js @supabase/functions-js

# 3. Vérifier que tout compile
pnpm run dev

# 4. Tester les APIs
curl http://localhost:5173/api/auth/admin/login -X POST -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"admin123"}'
```

---

## 📚 Documentation Créée Pendant la Migration

Gardez pour référence:
- ✅ `SUPABASE_TO_MYSQL_MIGRATION.md` - Vue d'ensemble complète
- ✅ `PRO_PAGES_MIGRATION_GUIDE.md` - Guide d'adaptation des pages
- ✅ `MYSQL_API.md` - Documentation API MySQL
- ✅ `MYSQL_BACKEND_SETUP.md` - Setup du backend

---

## 🎯 Ordre Recommandé

1. **Vérifier** que tous les tests passent
2. **Supprimer** les fichiers Supabase
3. **Nettoyer** `.env.local`
4. **Remplacer** les imports dans le code
5. **Tester** que tout fonctionne
6. **Commiter** et **pousser** les changements
7. **Déployer** en production

---

## ✅ Quand C'est Fait

Vous aurez:
- ❌ Plus de dépendance Supabase
- ✅ Authentification JWT 100% locale
- ✅ Base MySQL complètement autonome
- ✅ Meilleure performance (pas de latence réseau)
- ✅ Meilleure sécurité (données locales)
- ✅ Meilleures coûts (pas de facturation Supabase)

---

## 🆘 Troubleshooting

### "Erreur: module 'supabase' not found"
→ Vous avez oublié de remplacer un import. Vérifier tous les fichiers client.

### "JWT Token invalid"
→ Vérifier que `JWT_SECRET` est défini dans `.env.local`.

### "Auth endpoint not found"
→ Vérifier que `authRouter` est importé et enregistré dans `server/index.ts`.

### "Can't connect to database"
→ Vérifier `DATABASE_URL` dans `.env.local`.

---

## 📞 Support Final

Si vous avez des problèmes lors du nettoyage:
1. Vérifier cette checklist complètement
2. Vérifier les logs du serveur: `pnpm run dev`
3. Vérifier la console du navigateur (F12)
4. Vérifier les endpoints API avec curl
5. Vérifier la base de données avec phpMyAdmin
