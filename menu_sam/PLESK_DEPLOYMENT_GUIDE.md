# 🚀 Déploiement sur Plesk - Node.js + MySQL

Ce guide vous montre comment déployer votre application Node.js sur Plesk avec votre base de données MySQL existante.

---

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir:
- ✅ Un compte Plesk avec accès administrateur
- ✅ Node.js installé sur votre serveur Plesk
- ✅ Une base de données MySQL disponible sur Plesk
- ✅ Les identifiants de base de données (hostname, username, password)
- ✅ Accès SSH à votre domaine Plesk (optionnel mais recommandé)

---

## 🔧 Étape 1: Préparer votre Application Locale

### 1.1 Vérifier la version Node.js

Assurez-vous que votre `package.json` a les bonnes dépendances:

```bash
npm list | grep -E "express|prisma|mysql2|bcrypt"
```

Vous devriez voir:
- `express` (framework web)
- `@prisma/client` (ORM pour MySQL)
- `mysql2` (driver MySQL)
- `bcrypt` (hachage de mots de passe)

### 1.2 Compiler l'Application

```bash
npm run build
```

Cela crée:
- `dist/spa/` - Frontend compilé
- `dist/server/` - Backend compilé

### 1.3 Vérifier les Fichiers Compilés

```bash
ls -la dist/
```

Vous devriez voir les dossiers `spa` et `server`.

---

## 📤 Étape 2: Uploader les Fichiers sur Plesk

### Option A: Via le Panel Plesk (Graphique)

1. **Connectez-vous au Panel Plesk**
   - Allez à `https://votre-domaine.com:8443/` (ou l'URL de votre Plesk)
   - Entrez vos identifiants

2. **Accédez à File Manager**
   - Sélectionnez votre domaine
   - Cliquez sur **Files** → **File Manager**
   - Naviguez jusqu'au dossier `httpdocs` ou `public_html`

3. **Uploadez les Fichiers**
   - Cliquez sur **Upload** (bouton)
   - Sélectionnez le contenu de votre projet:
     - `dist/` (compilé)
     - `node_modules/` (si nécessaire, ou réinstallez)
     - `prisma/` (schéma et migrations)
     - `.env.local` (variables d'environnement)
     - `package.json`
     - `pnpm-lock.yaml` ou `package-lock.json`

4. **Alternatives pour Gros Uploads**
   - **ZIP et Upload**: Compressez, uploadez, puis décompressez via File Manager
   - **Via SSH** (voir Option B ci-dessous)

### Option B: Via SSH (Plus Rapide pour Gros Projets)

Si votre serveur supporte SSH:

```bash
# 1. Compressez votre projet
zip -r mon-app.zip dist/ node_modules/ prisma/ package.json pnpm-lock.yaml .env.local

# 2. Uploadez via SCP
scp mon-app.zip utilisateur@votre-domaine.com:/home/utilisateur/mon-app/

# 3. Connectez-vous en SSH
ssh utilisateur@votre-domaine.com

# 4. Décompressez
cd /home/utilisateur/mon-app/
unzip -o mon-app.zip
rm mon-app.zip
```

### Option C: Via Git (Recommandé pour les Mises à Jour)

Si Plesk a Git installé:

```bash
# 1. Dans le panel Plesk, accédez à Git
# 2. Cliquez "Add Repository"
# 3. Entrez votre URL de repository (GitHub, GitLab, etc.)
# 4. Sélectionnez la branche à déployer

# Puis, pour les mises à jour futures:
ssh utilisateur@votre-domaine.com
cd /path/to/app
git pull origin main
npm install
npm run build
```

---

## 🗄️ Étape 3: Configurer la Base de Données MySQL

### 3.1 Créer une Base de Données sur Plesk

1. **Accédez aux Databases dans Plesk**
   - Sélectionnez votre domaine
   - Cliquez sur **Databases** → **MySQL**

2. **Créez une Nouvelle Base de Données**
   - Cliquez **Add Database**
   - Nom: `lepetitbraise` (ou votre nom)
   - Utilisateur: créez un nouvel utilisateur (ex: `lpb_user`)
   - Mot de passe: générez un mot de passe fort

3. **Notez les Identifiants**
   ```
   Hostname: localhost  (ou votre hostname)
   Database: lepetitbraise
   Username: lpb_user
   Password: VotreMotDePasseFort123!
   Port: 3306 (par défaut)
   ```

### 3.2 Importer votre Schéma Existant

Vous avez deux options:

#### Option A: Via phpMyAdmin (Graphique)

1. Dans Plesk, cliquez sur **Databases** → **lepetitbraise** → **phpMyAdmin**
2. Cliquez sur l'onglet **Import**
3. Sélectionnez votre fichier SQL d'export XAMPP:
   - `mysql_dump.sql` (ou votre fichier de backup)
4. Cliquez **Go** pour importer

#### Option B: Via SSH (Plus Fiable)

```bash
ssh utilisateur@votre-domaine.com

# Naviguez au dossier de l'app
cd /home/utilisateur/mon-app/

# Importez le SQL
mysql -u lpb_user -p lepetitbraise < mysql_dump.sql

# Entrez le mot de passe quand demandé
```

### 3.3 Vérifier l'Import

```bash
mysql -u lpb_user -p lepetitbraise -e "SHOW TABLES;"
```

Vous devriez voir:
- `admin`
- `client`
- `commandes`
- `command_products`
- `menu_category`
- `place`
- `participants`
- `payments`

---

## 🔐 Étape 4: Configurer les Variables d'Environnement

### 4.1 Via le Panel Plesk

1. **Accédez à Node.js Settings**
   - Sélectionnez votre domaine
   - Cliquez sur **Node.js** → **Settings**

2. **Ajoutez les Variables d'Environnement**
   ```
   DATABASE_URL=mysql://lpb_user:VotreMotDePasseFort123!@localhost:3306/lepetitbraise
   JWT_SECRET=VotreSecretJWTTresFortEt32CaracteresMinimum!
   NODE_ENV=production
   FRONTEND_URL=https://votre-domaine.com
   PING_MESSAGE=Bienvenue sur Le Petit Braise API!
   ```

3. **Sauvegardez**

### 4.2 Via SSH (.env.local)

```bash
ssh utilisateur@votre-domaine.com
cd /home/utilisateur/mon-app/

# Créez le fichier .env.local
cat > .env.local << 'EOF'
DATABASE_URL="mysql://lpb_user:VotreMotDePasseFort123!@localhost:3306/lepetitbraise"
JWT_SECRET="VotreSecretJWTTresFortEt32CaracteresMinimum!"
NODE_ENV=production
FRONTEND_URL=https://votre-domaine.com
PING_MESSAGE=Bienvenue sur Le Petit Braise API!
EOF

# Sécurisez le fichier
chmod 600 .env.local
```

### 4.3 ⚠️ Secrets Importants

- **`JWT_SECRET`**: Doit être aléatoire et fort (min 32 caractères)
- **`DATABASE_URL`**: Ne jamais partager ou committer
- **`NODE_ENV`**: Doit être `production` en prod

Générez un JWT_SECRET fort:

```bash
# Linux/Mac
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Windows PowerShell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🚀 Étape 5: Installer les Dépendances et Compiler

### 5.1 Via SSH

```bash
ssh utilisateur@votre-domaine.com
cd /home/utilisateur/mon-app/

# Installez les dépendances
npm install
# ou si vous utilisez pnpm:
pnpm install

# Compilez l'application
npm run build
# ou
pnpm build
```

### 5.2 Via le Panel Plesk

Certaines versions de Plesk permettent d'exécuter des commandes via **Terminal**:

1. Cliquez sur **Tools & Settings** → **Terminal**
2. Naviguez: `cd /home/utilisateur/mon-app/`
3. Exécutez: `npm install && npm run build`

---

## 🗃️ Étape 6: Configurer le Serveur Node.js sur Plesk

### 6.1 Accédez aux Paramètres Node.js

1. **Panel Plesk** → Sélectionnez votre domaine
2. Cliquez sur **Node.js**

### 6.2 Configurez le Serveur

- **App Mode**: `Engaged` (activé)
- **Application startup file**: 
  - Si compilé: `dist/server/node-build.mjs`
  - Si TypeScript direct: `server/index.ts` (avec tsx)
- **Node.js version**: v18.x ou v20.x (recommandé v20)
- **Package manager**: npm ou pnpm
- **Environment**: Production

### 6.3 Configuration Avancée (si nécessaire)

```bash
# Votre startup file doit exporter createServer()
# Exemple: dist/server/node-build.mjs

import { createServer } from "./index.mjs";
const app = createServer();
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
```

---

## 🔄 Étape 7: Démarrer le Serveur

### 7.1 Via le Panel Plesk

1. Dans **Node.js Settings**, cliquez **Start Node.js App**
2. Vérifiez que le statut passe à ✅ **Running**

### 7.2 Via SSH

```bash
ssh utilisateur@votre-domaine.com
cd /home/utilisateur/mon-app/

# Démarrez avec npm
npm start

# Ou directement avec node
node dist/server/node-build.mjs
```

### 7.3 Vérifiez que le Serveur Tourne

```bash
# Testez votre API
curl https://votre-domaine.com/api/ping

# Réponse attendue:
# {"message":"Bienvenue sur Le Petit Braise API!"}
```

---

## 🗄️ Étape 8: Configurer les Relations Prisma (Optionnel)

Si vous avez modifié votre schéma Prisma après l'upload:

### 8.1 Générez le Client Prisma

```bash
ssh utilisateur@votre-domaine.com
cd /home/utilisateur/mon-app/
npx prisma generate
```

### 8.2 Exécutez les Migrations

```bash
# Vérifiez les migrations
npx prisma migrate status

# Appliquez les migrations
npx prisma migrate deploy

# Réinitialisez (⚠️ Attention: supprime les données!)
# npx prisma migrate reset
```

---

## 🔗 Étape 9: Configurer les Domaines et SSL/HTTPS

### 9.1 Ajouter un Domaine (si nécessaire)

1. **Panel Plesk** → **Domains** → **Add Domain**
2. Entrez votre nom de domaine
3. Cliquez **OK**

### 9.2 Configurer SSL (Let's Encrypt - Gratuit)

1. **Panel Plesk** → Sélectionnez votre domaine
2. Cliquez sur **SSL/TLS Certificates**
3. Cliquez **Add SSL Certificate**
4. Sélectionnez **Let's Encrypt**
5. Cochez votre domaine
6. Cliquez **Install**

Plesk renouvellera automatiquement tous les 90 jours.

### 9.3 Forcer HTTPS

```bash
# Créez/modifiez .htaccess à la racine
cat > .htaccess << 'EOF'
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>
EOF
```

---

## 📊 Étape 10: Vérifier le Déploiement

### 10.1 Testez les Endpoints

```bash
# Test basique
curl https://votre-domaine.com/api/ping

# Test authentification
curl -X POST https://votre-domaine.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "VotreMotDePasse",
    "role": "admin"
  }'

# Test base de données
curl https://votre-domaine.com/api/mysql/orders
```

### 10.2 Vérifiez les Logs

```bash
ssh utilisateur@votre-domaine.com
cd /home/utilisateur/mon-app/

# Voir les logs Node.js
tail -f /var/log/plesk/nodejs.log

# Ou via Plesk:
# Panel → Monitoring → Error & Access Logs
```

### 10.3 Vérifiez la Connectivité à la Base de Données

```bash
# Testez la connexion MySQL
mysql -h localhost -u lpb_user -p lepetitbraise -e "SELECT COUNT(*) FROM commandes;"

# Entrez le mot de passe quand demandé
```

---

## 🔒 Étape 11: Configuration de Sécurité Recommandée

### 11.1 Ajouter CORS

Modifiez `server/index.ts`:

```typescript
import cors from "cors";

export function createServer() {
  const app = express();

  app.use(cors({
    origin: process.env.FRONTEND_URL || "https://votre-domaine.com",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));

  // ... reste du code
  return app;
}
```

### 11.2 Ajouter les Headers de Sécurité

```bash
pnpm add helmet

# Modifiez server/index.ts
```

```typescript
import helmet from "helmet";

app.use(helmet());
app.use(cors({...}));
```

### 11.3 Activer Rate Limiting

```bash
pnpm add express-rate-limit
```

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limite à 100 requêtes par windowMs
});

app.use("/api/", limiter);
```

Puis recompiler: `npm run build`

---

## 🆘 Dépannage

### Problème: "Impossible de se connecter à la base de données"

**Cause**: La chaîne `DATABASE_URL` est incorrecte

**Solution**:
```bash
# Vérifiez les identifiants
mysql -h localhost -u lpb_user -p lepetitbraise -e "SELECT 1;"

# Mettez à jour DATABASE_URL dans Plesk
# mysql://lpb_user:PASSWORD@localhost:3306/lepetitbraise
```

### Problème: "Node.js ne démarre pas"

**Cause**: Port déjà utilisé ou erreur dans le code

**Solution**:
```bash
# Vérifiez les logs
tail -f /var/log/plesk/nodejs.log

# Vérifiez le port
netstat -tlnp | grep 3000

# Redémarrez Node.js depuis Plesk
# Panel → Node.js → Stop → Start
```

### Problème: "Erreur 502 Bad Gateway"

**Cause**: Le serveur Node.js ne répond pas

**Solution**:
```bash
# Redémarrez le serveur
ssh utilisateur@votre-domaine.com
cd /home/utilisateur/mon-app/
npm start &

# Ou via Plesk:
# Panel → Node.js → Restart
```

### Problème: "JWT Secret vide"

**Cause**: `JWT_SECRET` n'est pas défini

**Solution**:
1. Générez un secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Ajoutez-le dans Plesk → Environment Variables
3. Redémarrez Node.js

### Problème: "Permission denied" sur .env.local

**Cause**: Permissions de fichier incorrectes

**Solution**:
```bash
ssh utilisateur@votre-domaine.com
cd /home/utilisateur/mon-app/
chmod 600 .env.local
chmod 755 dist/
```

---

## 📈 Monitoring et Logs

### 11.1 Accéder aux Logs Plesk

**Panel Plesk:**
1. Sélectionnez votre domaine
2. Cliquez **Monitoring** → **Error & Access Logs**
3. Sélectionnez le type de log:
   - **access_log**: Requêtes HTTP
   - **error_log**: Erreurs du serveur

### 11.2 Vérifier les Performances

```bash
ssh utilisateur@votre-domaine.com

# Vérifiez la RAM utilisée
free -h

# Vérifiez l'utilisation CPU
top -b -n 1 | head -20

# Vérifiez le processus Node.js
ps aux | grep node
```

---

## ✅ Checklist Final

Avant de considérer le déploiement complet:

- [ ] Base de données créée sur Plesk
- [ ] Schéma importé et tables visibles
- [ ] Variables d'environnement définies
- [ ] Application compilée (`npm run build`)
- [ ] Fichiers uploadés sur Plesk
- [ ] Node.js démarré et running
- [ ] `/api/ping` répond correctement
- [ ] `/api/auth/login` fonctionne
- [ ] `/api/mysql/orders` retourne les commandes
- [ ] SSL/HTTPS configuré
- [ ] Domaine pointe vers Plesk
- [ ] Logs vérifiés (pas d'erreurs)
- [ ] Backup quotidien configuré

---

## 🚀 Prochaines Étapes

### 1. Sauvegardes Automatiques

```bash
# Créez un script de backup
cat > /home/utilisateur/mon-app/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u lpb_user -p lepetitbraise > /home/utilisateur/backups/db_$DATE.sql
zip -r /home/utilisateur/backups/app_$DATE.zip /home/utilisateur/mon-app/
# Gardez les 7 derniers backups
find /home/utilisateur/backups/ -name "*.sql" -mtime +7 -delete
find /home/utilisateur/backups/ -name "*.zip" -mtime +7 -delete
EOF

chmod +x backup.sh

# Ajoutez un CRON pour backup quotidien
# Panel Plesk → Scheduled Tasks
# Heure: 02:00 (tous les jours)
# Commande: /home/utilisateur/mon-app/backup.sh
```

### 2. Monitoring Avancé

Envisagez d'ajouter:
- **Sentry** pour le tracking d'erreurs
- **Prometheus** pour les metrics
- **Winston** pour les logs structurés

### 3. Auto-Restart en Cas de Crash

Plesk gère normalement cela automatiquement, mais vous pouvez aussi:

```bash
# Ajouter un health check
# Dans server/index.ts, ajoutez:

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});
```

---

## 📞 Support et Ressources

- **Documentation Plesk**: https://docs.plesk.com/
- **Documentation Node.js**: https://nodejs.org/docs/
- **Documentation Prisma**: https://www.prisma.io/docs/
- **MySQL Docs**: https://dev.mysql.com/doc/

---

## 🎉 Bravo!

Vous avez déployé votre application sur Plesk! 

**Prochaines actions:**
1. Testez tous les endpoints
2. Configurez les backups
3. Monitorer les logs
4. Optimisez les performances
5. Adaptez les pages PRO (si pas encore fait)

---

**Bonne chance! 🚀**

*Pour plus d'aide, consultez les guides de migration et les documentations Plesk.*
