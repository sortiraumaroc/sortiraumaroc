# 🔧 Configuration du Reverse Proxy dans Plesk pour les routes API

## Problème

Les requêtes `POST /api/payments/lacaissepay/session` reçoivent du **HTML** au lieu de JSON. Cela signifie que les requêtes `/api/*` n'atteignent **pas** Node.js et sont interceptées par Apache.

## Solution : Configurer le Reverse Proxy dans Plesk

### Méthode 1 : Via le Gestionnaire Node.js de Plesk (Recommandé)

1. **Connectez-vous à Plesk**
2. Allez dans **Domaines** > `sambooking.ma` > **Node.js**
3. Vérifiez que :
   - ✅ Node.js est **activé**
   - ✅ L'application est **démarrée**
   - ✅ Le **fichier de démarrage** est : `dist/server/node-build.mjs`
   - ✅ Le **port** est correct (visible dans les logs)

4. **Vérifiez les logs Node.js** :
   - Vous devriez voir : `🚀 Fusion Starter server running on port XXXX`
   - Si vous ne voyez pas cette ligne, Node.js n'est pas démarré

### Méthode 2 : Configuration Apache manuelle (si la méthode 1 ne fonctionne pas)

Si le gestionnaire Node.js ne configure pas automatiquement le reverse proxy :

1. **Dans Plesk**, allez dans **Domaines** > `sambooking.ma` > **Apache & Nginx Settings**
2. Cliquez sur **Additional Apache directives**
3. **Ajoutez** cette configuration (remplacez `PORT` par le port de votre app Node.js) :

```apache
# Activer les modules nécessaires
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so

# Configuration du reverse proxy
ProxyPreserveHost On
ProxyRequests Off

# Proxy toutes les requêtes vers Node.js
# Remplacez PORT par le port de votre application Node.js
ProxyPass /api/ http://localhost:PORT/api/
ProxyPassReverse /api/ http://localhost:PORT/api/

# Proxy le reste aussi (pour le SPA)
ProxyPass / http://localhost:PORT/
ProxyPassReverse / http://localhost:PORT/
```

**Important** : Remplacez `PORT` par le port réel de votre application Node.js (visible dans les logs Plesk Node.js).

### Méthode 3 : Configuration via fichier vhost.conf (avancé)

Si vous avez accès SSH et que les méthodes précédentes ne fonctionnent pas :

1. **Connectez-vous en SSH**
2. **Trouvez le fichier de configuration du vhost** :
   ```bash
   # Généralement dans :
   /var/www/vhosts/system/sambooking.ma/conf/vhost.conf
   # ou
   /etc/apache2/vhosts.d/sambooking.ma.conf
   ```

3. **Ajoutez** la configuration du reverse proxy (voir Méthode 2)

4. **Redémarrez Apache** :
   ```bash
   service httpd restart
   # ou
   systemctl restart apache2
   ```

## Vérification

### Test 1 : Vérifier que Node.js écoute bien

```bash
# Via SSH, testez directement Node.js
curl http://localhost:PORT/api/ping
```

Si cela retourne `{"message":"ping"}` (JSON), Node.js fonctionne. Le problème est alors le reverse proxy.

### Test 2 : Vérifier que le reverse proxy fonctionne

```bash
# Testez via le domaine
curl https://sambooking.ma/api/ping
```

- ✅ Si vous obtenez `{"message":"ping"}` (JSON) : Le reverse proxy fonctionne !
- ❌ Si vous obtenez du HTML (`<!doctype html>`) : Le reverse proxy n'est pas configuré

### Test 3 : Tester l'API de paiement

```bash
curl -X POST https://sambooking.ma/api/payments/lacaissepay/session \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

- ✅ Si vous obtenez du JSON (même une erreur) : C'est résolu !
- ❌ Si vous obtenez du HTML : Le problème persiste

## Diagnostic : Pourquoi ça fonctionne en localhost mais pas sur le serveur ?

**En localhost** :
- Vous accédez directement à Node.js sur `http://localhost:3000`
- Pas de proxy, pas d'Apache

**Sur le serveur** :
- Les requêtes passent par Apache (port 80/443)
- Apache doit **proxifier** les requêtes vers Node.js
- Si le reverse proxy n'est pas configuré, Apache sert les fichiers statiques ou `index.html`

## Solution temporaire : Désactiver le `.htaccess`

Pour tester si le problème vient du `.htaccess` :

1. **Renommez** le `.htaccess` :
   ```bash
   mv .htaccess .htaccess.disabled
   ```

2. **Testez** l'API :
   ```bash
   curl -X POST https://sambooking.ma/api/payments/lacaissepay/session \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

3. **Si ça fonctionne** : Le problème vient du `.htaccess` (mais c'est peu probable)
4. **Si ça ne fonctionne pas** : Le problème vient du reverse proxy (plus probable)

## Solution alternative : Utiliser un sous-domaine pour l'API

Si la configuration du reverse proxy est trop complexe, vous pouvez :

1. **Créer un sous-domaine** `api.sambooking.ma`
2. **Configurer ce sous-domaine** pour pointer directement vers Node.js
3. **Modifier le code client** pour utiliser `https://api.sambooking.ma` au lieu de `/api/`

Mais cette solution nécessite des modifications du code.

## Contact Support

Si aucune de ces méthodes ne fonctionne :

1. **Contactez le support Plesk/Contabo**
2. **Demandez** : "Comment configurer un reverse proxy Apache vers une application Node.js pour que les routes `/api/*` fonctionnent ?"
3. **Fournissez** :
   - Le port utilisé par Node.js
   - Les logs d'erreur Apache
   - Les logs Node.js

## Notes importantes

- Le `.htaccess` ne peut **pas** configurer le reverse proxy - il peut seulement s'assurer que les règles de réécriture n'interceptent pas `/api/*`
- Sur Plesk, le reverse proxy devrait être configuré automatiquement par le gestionnaire Node.js
- Si le reverse proxy n'est pas configuré, **toutes** les requêtes `/api/*` seront interceptées par Apache et serviront `index.html` ou une erreur 404
