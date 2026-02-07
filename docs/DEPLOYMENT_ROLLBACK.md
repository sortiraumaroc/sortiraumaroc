# Procédure de Déploiement et Rollback — SAM (sam.ma)

## 1. Architecture de déploiement

- **Hébergement** : VPS
- **Base de données** : Supabase (PostgreSQL managé)
- **Emails** : SendGrid (SMTP)
- **Stockage** : Supabase Storage

## 2. Pré-requis avant déploiement

### Checklist pré-déploiement

- [ ] Tests passés en local (`pnpm test`)
- [ ] Build réussi (`pnpm build`)
- [ ] Variables d'environnement vérifiées
- [ ] Migrations DB identifiées et testées sur staging
- [ ] Backup Supabase récent (< 24h)

### Variables d'environnement critiques

```bash
# Vérifier que ces variables sont définies en prod
NODE_ENV=production
SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
SMTP_HOST=smtp.sendgrid.net
SMTP_USER=xxx
SMTP_PASS=xxx
```

## 3. Procédure de déploiement standard

### 3.1 Déploiement du code

```bash
# 1. Pull les dernières modifications
cd /var/www/sam
git fetch origin
git checkout main
git pull origin main

# 2. Installer les dépendances
pnpm install --frozen-lockfile

# 3. Build
pnpm build

# 4. Redémarrer le service
pm2 restart sam-server

# 5. Vérifier le statut
pm2 status
pm2 logs sam-server --lines 50
```

### 3.2 Migrations de base de données

```bash
# Les migrations sont dans /server/migrations/
# Exécuter via Supabase Dashboard > SQL Editor
# OU via script:
pnpm run migration:run <filename>
```

**⚠️ IMPORTANT** : Toujours faire un backup AVANT une migration !

## 4. Procédure de Rollback

### 4.1 Rollback du code (rapide, < 5 min)

```bash
# 1. Identifier le commit précédent stable
git log --oneline -10

# 2. Revenir au commit précédent
git checkout <commit-hash>

# 3. Rebuild
pnpm install --frozen-lockfile
pnpm build

# 4. Redémarrer
pm2 restart sam-server

# 5. Vérifier
pm2 logs sam-server --lines 50
curl -I https://sam.ma/api/health
```

### 4.2 Rollback de migration DB (complexe)

**⚠️ À utiliser uniquement si la migration a causé un problème critique**

1. **Identifier la migration problématique**
   ```bash
   ls -la server/migrations/
   ```

2. **Restaurer depuis backup Supabase**
   - Aller sur Supabase Dashboard > Database > Backups
   - Sélectionner le backup avant la migration
   - Restaurer (Point-in-Time Recovery)

3. **OU Exécuter le script de rollback** (si disponible)
   ```sql
   -- Chaque migration devrait avoir un rollback documenté
   -- Voir les commentaires dans le fichier de migration
   ```

## 5. Contacts d'urgence

| Rôle | Contact |
|------|---------|
| Admin technique | support@sortiraumaroc.ma |
| Supabase Support | support@supabase.io |
| SendGrid | app.sendgrid.com |

## 6. Monitoring post-déploiement

### Commandes de vérification

```bash
# Statut du serveur
pm2 status

# Logs en temps réel
pm2 logs sam-server

# Santé de l'API
curl https://sam.ma/api/health

# Vérifier les erreurs 5xx
pm2 logs sam-server --lines 1000 | grep -i error
```

### Métriques à surveiller

- [ ] Temps de réponse API < 500ms
- [ ] Pas d'erreurs 5xx dans les logs
- [ ] Emails transactionnels envoyés (vérifier SendGrid Activity)
- [ ] Réservations créées avec succès

## 7. Historique des déploiements

| Date | Version/Commit | Changements | Statut |
|------|---------------|-------------|--------|
| YYYY-MM-DD | abc1234 | Description | ✅/❌ |

---

**Dernière mise à jour** : 2026-02-05
