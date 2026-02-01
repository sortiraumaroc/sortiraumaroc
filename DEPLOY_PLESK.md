# Guide de déploiement sur Plesk (Contabo)

Ce guide explique comment déployer l'application sur un serveur Plesk hébergé chez Contabo.

## Prérequis

- Accès à Plesk avec le module Node.js installé
- Node.js 22.x (spécifié dans `.node-version`)
- npm ou pnpm (pnpm recommandé, mais npm fonctionne aussi)

## Méthode 1 : Déploiement via Gestionnaire Node.js de Plesk (Recommandé)

### Étape 1 : Préparer le build localement (optionnel)

Vous pouvez construire le projet localement avant de le déployer :

```bash
# Installer les dépendances
pnpm install
# ou
npm install

# Construire pour la production
pnpm run build:plesk
# ou
npm run build:plesk
```

Les fichiers seront générés dans :
- `dist/spa/` - Application React (frontend)
- `dist/server/` - Serveur Express (backend)

### Étape 2 : Déployer via Git ou FTP

1. **Via Git (recommandé)** :
   - Configurez un dépôt Git dans Plesk
   - Plesk peut exécuter automatiquement les scripts de build après le déploiement

2. **Via FTP/FileZilla** :
   - Uploadez tous les fichiers du projet dans le répertoire `httpdocs` de votre domaine
   - Assurez-vous d'inclure le fichier `.node-version`

### Étape 3 : Configurer Node.js dans Plesk

1. Connectez-vous à Plesk
2. Allez dans **Domaines** > Votre domaine > **Node.js**
3. Si Node.js n'est pas activé, activez-le
4. Configurez les paramètres suivants :
   - **Version Node.js** : Sélectionnez Node.js 22.x (ou la version disponible la plus proche)
   - **Mode d'application** : `Production`
   - **Fichier de démarrage** : `dist/server/node-build.mjs`
   - **Document root** : `httpdocs`
   - **Script de démarrage** : Laissez vide ou utilisez `npm start`

### Étape 4 : Variables d'environnement

Dans la section **Variables d'environnement** de Plesk Node.js :

```
NODE_ENV=production
PORT=3000
```

Ajoutez également toutes vos variables d'environnement nécessaires :
- Variables de base de données
- Clés API
- URLs de services externes
- etc.

**Important** : Ne commitez jamais votre fichier `.env` dans Git. Configurez ces variables directement dans Plesk.

### Étape 5 : Installer les dépendances et construire

1. Dans la section **Node.js** de Plesk, utilisez la console SSH ou :
2. Cliquez sur **NPM Install** si disponible, ou
3. Ouvrez un terminal SSH et exécutez :

```bash
cd /var/www/vhosts/votre-domaine.com/httpdocs
npm install --production=false  # Inclut les devDependencies nécessaires pour le build
npm run build:plesk
```

**Note** : Le script `build:plesk` utilise `cross-env` pour fonctionner sur Windows et Linux. Vous pouvez construire localement sur Windows avant de déployer, ou directement sur le serveur Linux via SSH.

### Étape 6 : Démarrer l'application

1. Dans Plesk Node.js, cliquez sur **Activer**
2. L'application devrait démarrer automatiquement
3. Vérifiez les logs dans Plesk pour confirmer le démarrage
   - Vous devriez voir : `✅ Servir les fichiers statiques depuis : /chemin/vers/dist/spa`
   - Si vous voyez une erreur, vérifiez que le répertoire `dist/spa` existe

**Important** : Si vous voyez des erreurs de type MIME (comme "Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of 'text/html'"), cela signifie que les fichiers statiques ne sont pas trouvés. Vérifiez :
- Que le build a bien créé `dist/spa/` avec tous les fichiers
- Que le chemin dans les logs correspond bien à l'emplacement réel des fichiers
- Que les permissions sont correctes pour lire les fichiers

### Étape 7 : Configuration du domaine

Si votre application doit écouter sur le port 80/443 :

1. Allez dans **Domaines** > Votre domaine > **Paramètres d'hébergement**
2. Configurez le reverse proxy si nécessaire
3. Ou configurez Plesk pour utiliser directement Node.js (si supporté)

## Méthode 2 : Build automatique via postinstall

Le `package.json` contient un script `postinstall` qui construit automatiquement l'application après `npm install`. Cela peut être utilisé si Plesk exécute automatiquement npm install après un déploiement Git.

**Note** : Cette méthode peut être désactivée en supprimant la ligne `"postinstall"` du `package.json` si vous préférez construire manuellement.

## Vérification du déploiement

1. Vérifiez que l'application répond : `https://votre-domaine.com`
2. Testez l'API : `https://votre-domaine.com/api/ping`
3. Vérifiez les logs dans Plesk > Node.js > Logs

## Dépannage

### L'application ne démarre pas

- Vérifiez les logs dans Plesk
- Assurez-vous que Node.js 22.x est sélectionné
- Vérifiez que `dist/server/node-build.mjs` existe
- Vérifiez les permissions des fichiers

### Erreur "Cannot find module"

- Assurez-vous que `npm install` a été exécuté
- Vérifiez que toutes les dépendances sont installées (y compris devDependencies pour le build)

### Port déjà utilisé

- Changez la variable d'environnement `PORT` dans Plesk
- Ou laissez Plesk gérer automatiquement le port

### Build échoue

- Vérifiez que vous avez assez de mémoire (le build peut nécessiter 4GB+)
- Utilisez `npm run build:plesk` au lieu de `npm run build` pour une version optimisée

### Les routes API ne fonctionnent pas

**Problème courant** : Sur Plesk, les routes API (`/api/*`) peuvent ne pas fonctionner si le serveur web (Apache/Nginx) intercepte les requêtes avant qu'elles n'atteignent Node.js.

**Solutions** :

1. **Vérifier les logs du serveur** :
   ```bash
   # Dans les logs Plesk Node.js, vous devriez voir :
   [API] GET /api/ping
   ```
   Si vous ne voyez pas ces logs, les requêtes n'atteignent pas Node.js.

2. **Configuration du reverse proxy** :
   - Allez dans **Domaines** > Votre domaine > **Apache & Nginx Settings**
   - Assurez-vous que le reverse proxy est configuré pour diriger toutes les requêtes vers Node.js
   - Ou créez un fichier `.htaccess` (si Apache) pour exclure `/api/*` de certaines règles

3. **Vérifier le fichier `.htaccess`** :
   - Le fichier `.htaccess` fourni ne doit pas intercepter les routes `/api/*`
   - Vérifiez que la règle RewriteRule n'intercepte pas les routes API

4. **Tester directement** :
   ```bash
   # Via SSH, testez directement Node.js
   curl http://localhost:PORT/api/ping
   ```
   Si cela fonctionne en local mais pas via le domaine, c'est un problème de proxy.

5. **Configuration Apache/Nginx** :
   - Si Apache/Nginx est devant Node.js, assurez-vous que toutes les routes `/api/*` sont bien proxifiées
   - Dans Plesk, vérifiez **Domaines** > **Paramètres d'hébergement** > **Reverse proxy**

6. **Variables d'environnement** :
   - Vérifiez que `NODE_ENV=production` est défini dans Plesk
   - Assurez-vous que le port utilisé par Node.js correspond à celui configuré dans Plesk

7. **Tester l'API directement** :
   ```bash
   # Testez depuis votre navigateur ou curl
   curl https://votre-domaine.com/api/ping
   # Devrait retourner : {"message":"ping"}
   ```

**Note** : Si Plesk utilise Apache avec `mod_rewrite`, certaines règles peuvent intercepter les routes API. Dans ce cas, ajoutez dans `.htaccess` :
```apache
# Ne pas réécrire les routes API
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^ - [L]
```

### Erreur LacaissePay : "HTML au lieu de JSON" / "Unexpected token '<'"

Si vous voyez une erreur du type **"LacaissePay session creation failed"** avec **"Unexpected token '<', \"<!doctype \"... is not valid JSON"** ou **"L'API de paiement n'a pas répondu correctement"** :

**Cause** : La requête `POST /api/payments/lacaissepay/session` reçoit du **HTML** (souvent `index.html` ou une page d'erreur) au lieu de JSON. L'API n'est donc **pas** atteinte par Node.js.

**Solution rapide** : Voir le guide détaillé dans **`PLESK_API_FIX.md`** pour une solution étape par étape.

**Résumé des étapes** :

1. **Vérifier la configuration du reverse proxy dans Plesk**
   - **Domaines** > Votre domaine > **Apache & Nginx Settings**
   - Vérifier que le reverse proxy est activé et configuré pour toutes les requêtes

2. **Remplacer le `.htaccess` par la version corrigée**
   - Utiliser `.htaccess.plesk-api-fix` qui garantit que `/api/*` n'est jamais intercepté
   - Ou mettre à jour le `.htaccess` actuel avec la règle améliorée :
     ```apache
     RewriteCond %{REQUEST_URI} ^/api/
     RewriteRule ^(.*)$ - [L,NS]
     ```

3. **Vérifier que Node.js est démarré**
   - Dans Plesk : **Domaines** > Votre domaine > **Node.js** > vérifier que l'app est activée
   - Vérifier les logs pour confirmer que les routes API sont enregistrées

4. **Tester l'API directement**
   ```bash
   curl -X POST https://votre-domaine.com/api/payments/lacaissepay/session \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   - Si la réponse commence par `<!doctype` ou `<html>`, le problème persiste
   - Si vous obtenez du JSON (même une erreur), c'est résolu

5. **Si le problème persiste**
   - Voir `PLESK_API_FIX.md` pour des solutions avancées (configuration Apache manuelle, etc.)

## Configuration .htaccess

Le fichier `.htaccess` est fourni dans le projet. Il configure :
- Le routage SPA pour React Router (sans interférer avec Node.js)
- La compression Gzip
- Le cache des fichiers statiques
- Les headers de sécurité

**Important** : 
- Si votre site fonctionne **sans** `.htaccess`, c'est normal - Node.js/Express gère déjà tout
- Le `.htaccess` est **optionnel** et ne doit être utilisé que si nécessaire
- Si vous ajoutez `.htaccess` et que le site ne fonctionne plus, supprimez-le ou utilisez la version corrigée

### Protection par mot de passe

Pour ajouter une protection par mot de passe :

1. **Créer le fichier `.htpasswd`** :
   ```bash
   # Via SSH sur le serveur
   htpasswd -cb .htpasswd admin sambooking2026YES
   ```

2. **Déplacer `.htpasswd`** dans un répertoire sécurisé (hors de `httpdocs/`) :
   ```bash
   mv .htpasswd /var/www/vhosts/votre-domaine.com/.htpasswd
   ```

3. **Utiliser la version avec mot de passe** :
   - Copiez `.htaccess.with-password` vers `.htaccess`
   - Remplacez `/chemin/vers/.htpasswd` par le chemin absolu réel

Voir `CREATE_PASSWORD.md` pour plus de détails.

## Structure des fichiers après build

```
httpdocs/
├── .htaccess          # Configuration Apache (si nécessaire)
├── dist/
│   ├── spa/           # Application React (frontend)
│   │   ├── index.html
│   │   └── assets/
│   └── server/        # Serveur Express
│       └── node-build.mjs
├── node_modules/      # Dépendances Node.js
├── package.json
├── .node-version      # Version Node.js requise
└── .env               # Variables d'environnement (ne pas commiter)
```

## Support

Pour plus d'aide :
- Documentation Plesk Node.js : https://docs.plesk.com/
- Support Contabo : https://contabo.com/en/contact/
