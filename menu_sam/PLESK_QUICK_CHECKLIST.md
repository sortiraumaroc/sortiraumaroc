# ⚡ Plesk Deployment - Quick Checklist

**Estimated Time**: 30-45 minutes (if MySQL database already exists on Plesk)

---

## 🔵 PHASE 1: Préparation (5 min)

- [ ] Avez-vous accès au panel Plesk?
- [ ] Avez-vous les identifiants MySQL (user/password)?
- [ ] Votre code est compilé? (`npm run build` ✅)
- [ ] Vérifiez les dossiers `dist/spa` et `dist/server` existent

**Commande à exécuter localement:**
```bash
npm run build && ls dist/
```

---

## 🔵 PHASE 2: Upload (10 min)

**Choisissez UNE option:**

### Option A: File Manager Plesk (Simple)
```
1. Panel Plesk → Votre Domaine → Files
2. Cliquez Upload
3. Uploadez: dist/, package.json, pnpm-lock.yaml, prisma/
4. Attendez la fin
```

### Option B: SSH + ZIP (Plus Rapide)
```bash
# Localement:
zip -r deploy.zip dist/ package.json pnpm-lock.yaml prisma/

# Upload via SCP:
scp deploy.zip user@domain.com:/home/user/mon-app/

# Sur le serveur (SSH):
cd /home/user/mon-app/
unzip -o deploy.zip
rm deploy.zip
```

### Option C: Git (Recommandé)
```bash
# Sur le serveur:
git clone votre-repo.git /home/user/mon-app/
cd /home/user/mon-app/
git pull origin main
```

- [ ] Fichiers uploadés avec succès

---

## 🔵 PHASE 3: Base de Données (10 min)

### Étape A: Créer la BD sur Plesk
```
Panel Plesk → Domaine → Databases → Add MySQL Database
Nom: lepetitbraise
User: lpb_user
Password: (générez un mot de passe fort)
```

**Sauvegardez ces infos:**
```
Hostname: localhost
Database: lepetitbraise
Username: lpb_user
Password: ________________
```

- [ ] Base de données créée

### Étape B: Importer votre Schéma (Choisissez UNE option)

#### Option 1: phpMyAdmin (Simple)
```
Panel Plesk → Domaine → Databases → lepetitbraise → phpMyAdmin
Import → Sélectionnez votre fichier .sql → Go
```

#### Option 2: SSH (Plus Fiable)
```bash
ssh user@domain.com
cd /home/user/mon-app/

# Préparez votre fichier SQL (export de XAMPP)
mysql -u lpb_user -p lepetitbraise < database_export.sql
```

- [ ] Schéma importé, tables visibles

**Vérifiez:**
```bash
mysql -u lpb_user -p lepetitbraise -e "SHOW TABLES;"
# Doit afficher: admin, client, commandes, etc.
```

---

## 🔵 PHASE 4: Variables d'Environnement (5 min)

### Via Panel Plesk:
```
Panel Plesk → Domaine → Node.js → Environment Variables

Ajoutez:
DATABASE_URL="mysql://lpb_user:PASSWORD@localhost:3306/lepetitbraise"
JWT_SECRET="(générez 32 chars avec: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"
NODE_ENV="production"
FRONTEND_URL="https://votre-domaine.com"
```

### Ou via SSH (.env.local):
```bash
ssh user@domain.com
cd /home/user/mon-app/

cat > .env.local << 'EOF'
DATABASE_URL="mysql://lpb_user:PASSWORD@localhost:3306/lepetitbraise"
JWT_SECRET="XXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
NODE_ENV=production
FRONTEND_URL=https://votre-domaine.com
EOF

chmod 600 .env.local
```

- [ ] Variables définies et sécurisées

---

## 🔵 PHASE 5: Installation & Build (5 min)

### Via SSH:
```bash
ssh user@domain.com
cd /home/user/mon-app/

# Installez les dépendances
npm install

# Compilez
npm run build

# Vérifiez que tout est OK
ls dist/server/node-build.mjs
```

- [ ] Installation réussie
- [ ] Build réussie

---

## 🔵 PHASE 6: Configuration Node.js (5 min)

### Panel Plesk:
```
Panel Plesk → Domaine → Node.js

Configurez:
✅ App Mode: Engaged
✅ Startup File: dist/server/node-build.mjs
✅ Node.js Version: v20.x (ou v18.x)
✅ Package Manager: npm
✅ Environment: Production

Cliquez: SAVE
```

- [ ] Node.js configuré

---

## 🔵 PHASE 7: Démarrer le Serveur (2 min)

### Panel Plesk:
```
Panel Plesk → Domaine → Node.js

Cliquez: START

Attendez 10 secondes...
```

**Vérifiez le statut**: Doit être ✅ **Running**

- [ ] Serveur démarré

---

## 🔵 PHASE 8: Tester (5 min)

### Test 1: Ping Basique
```bash
curl https://votre-domaine.com/api/ping

# Réponse attendue:
# {"message":"Bienvenue sur Le Petit Braise API!"}
```

### Test 2: Authentification
```bash
curl -X POST https://votre-domaine.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "votreMotDePasse",
    "role": "admin"
  }'

# Réponse attendue:
# {"token":"eyJhbGciOi...","user":{...}}
```

### Test 3: Requête API
```bash
curl https://votre-domaine.com/api/mysql/orders

# Doit retourner un JSON valide
```

- [ ] Tous les tests passent

---

## 🔵 PHASE 9: SSL/HTTPS (5 min)

### Panel Plesk:
```
Panel Plesk → Domaine → SSL/TLS Certificates

Cliquez: Add SSL Certificate
Sélectionnez: Let's Encrypt
Cochez: Votre domaine
Cliquez: INSTALL
```

**Attendez 2-3 minutes...**

- [ ] SSL configuré et actif

---

## 🔵 PHASE 10: Vérification Finale (5 min)

- [ ] Accédez à https://votre-domaine.com (pas de warning SSL)
- [ ] /api/ping répond correctement
- [ ] /api/auth/login fonctionne
- [ ] /api/mysql/orders retourne les données
- [ ] Panel Plesk → Monitoring → Logs (aucune erreur rouge)

---

## 🆘 Problèmes Courants

### ❌ "502 Bad Gateway"
```bash
# 1. Vérifiez les logs
Panel Plesk → Monitoring → Error Logs

# 2. Redémarrez Node.js
Panel Plesk → Node.js → Restart

# 3. Vérifiez que NODE_ENV=production
# et DATABASE_URL est correct
```

### ❌ "Cannot connect to database"
```bash
# Vérifiez la connexion:
ssh user@domain.com
mysql -u lpb_user -p lepetitbraise -e "SELECT 1;"

# Mettez à jour DATABASE_URL avec le bon password
```

### ❌ "JWT Secret is empty"
```bash
# Générez un secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Ajoutez-le dans Node.js → Environment Variables
# Redémarrez Node.js
```

---

## ✅ Vous Avez Réussi Si:

- ✅ Panel Plesk montre "Running" pour Node.js
- ✅ HTTPS fonctionne sans avertissements
- ✅ `/api/ping` répond
- ✅ `/api/auth/login` retourne un token JWT
- ✅ Logs Plesk sans erreurs
- ✅ Base de données est accessible

---

## 📞 Besoin d'Aide?

- Consultez: `PLESK_DEPLOYMENT_GUIDE.md` (guide complet)
- Consultez: `README_MIGRATION.md` (contexte technique)
- Consultez: Logs Plesk → Monitoring → Error Logs

---

## 🎉 Bravo!

Votre application est maintenant en production sur Plesk! 🚀

**Prochaines étapes:**
1. Configurez les backups automatiques
2. Testez depuis votre téléphone
3. Invitez des clients à tester
4. Monitorer les logs et performances

---

**Temps total: ~1 heure pour les débutants, ~30 min pour experts**

*Date de création: 2025*
*Document validé pour Plesk 12.x et versions récentes*
