# 🔧 Fix : Erreur "HTML au lieu de JSON" pour les routes API sur Plesk

## Problème

Les requêtes `POST /api/payments/lacaissepay/session` (et autres routes API) reçoivent du **HTML** au lieu de JSON. L'erreur dans la console est :
```
"Unexpected token '<', \"<!doctype \"... is not valid JSON"
```

**Cause** : Les requêtes `/api/*` sont interceptées par Apache et renvoient `index.html` au lieu d'être proxifiées vers Node.js.

## Solution étape par étape

### Étape 1 : Vérifier la configuration du reverse proxy dans Plesk

1. Connectez-vous à **Plesk**
2. Allez dans **Domaines** > Votre domaine > **Apache & Nginx Settings**
3. Vérifiez que le **reverse proxy** est activé et configuré pour **toutes les requêtes** (pas seulement certaines URLs)
4. Si le reverse proxy n'est pas activé, activez-le

**Important** : Sur Plesk, le gestionnaire Node.js configure généralement automatiquement un reverse proxy. Si vous utilisez le gestionnaire Node.js, vérifiez qu'il est bien activé.

### Étape 2 : Remplacer le `.htaccess` par la version corrigée

1. **Sauvegardez** votre `.htaccess` actuel :
   ```bash
   cp .htaccess .htaccess.backup
   ```

2. **Remplacez** le `.htaccess` par la version corrigée :
   ```bash
   cp .htaccess.plesk-api-fix .htaccess
   ```

   Ou copiez manuellement le contenu de `.htaccess.plesk-api-fix` dans `.htaccess`.

3. **Vérifiez** que le fichier est bien dans `httpdocs/` (le répertoire racine du domaine)

### Étape 3 : Vérifier que Node.js est bien démarré

1. Dans Plesk, allez dans **Domaines** > Votre domaine > **Node.js**
2. Vérifiez que l'application est **activée** et **démarrée**
3. Vérifiez les **logs** - vous devriez voir :
   ```
   🚀 Fusion Starter server running on port XXXX
   ✅ Route payment: POST /api/payments/lacaissepay/session
   ```

### Étape 4 : Tester l'API directement

Testez depuis votre navigateur ou via SSH :

```bash
# Test 1 : API ping (devrait retourner JSON)
curl https://sambooking.ma/api/ping

# Test 2 : API payment (devrait retourner une erreur JSON, pas du HTML)
curl -X POST https://sambooking.ma/api/payments/lacaissepay/session \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Si vous obtenez du HTML** (`<!doctype html>`), le problème persiste. Passez à l'étape 5.

**Si vous obtenez du JSON** (même une erreur), c'est bon ! Le problème est résolu.

### Étape 5 : Configuration Apache manuelle (si nécessaire)

Si le reverse proxy automatique de Plesk ne fonctionne pas, vous pouvez configurer Apache manuellement :

1. Dans Plesk, allez dans **Domaines** > Votre domaine > **Apache & Nginx Settings**
2. Cliquez sur **Additional Apache directives**
3. Ajoutez :

```apache
# Proxy toutes les requêtes vers Node.js
ProxyPreserveHost On
ProxyPass /api/ http://localhost:PORT/api/
ProxyPassReverse /api/ http://localhost:PORT/api/

# Proxy le reste vers Node.js aussi (pour le SPA)
ProxyPass / http://localhost:PORT/
ProxyPassReverse / http://localhost:PORT/
```

**Remplacez `PORT`** par le port utilisé par votre application Node.js (visible dans les logs Plesk Node.js).

**Note** : Cette configuration peut entrer en conflit avec le `.htaccess`. Si vous utilisez cette méthode, vous pouvez simplifier le `.htaccess` ou le retirer.

### Étape 6 : Alternative - Désactiver le `.htaccess` temporairement

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

3. **Si ça fonctionne** : Le problème vient du `.htaccess`. Utilisez `.htaccess.plesk-api-fix`.

4. **Si ça ne fonctionne pas** : Le problème vient de la configuration du reverse proxy dans Plesk. Vérifiez l'étape 1 et 5.

## Vérification finale

Après avoir appliqué les corrections :

1. ✅ L'API `/api/ping` retourne `{"message":"ping"}` (JSON)
2. ✅ L'API `/api/payments/lacaissepay/session` retourne une erreur JSON (pas du HTML)
3. ✅ Le frontend peut créer une session de paiement sans erreur "Unexpected token '<'"

## Si le problème persiste

1. **Vérifiez les logs Apache** dans Plesk :
   - **Domaines** > Votre domaine > **Logs** > **Apache Error Log**
   - Cherchez des erreurs liées à `/api/` ou au proxy

2. **Vérifiez les logs Node.js** dans Plesk :
   - **Domaines** > Votre domaine > **Node.js** > **Logs**
   - Vous devriez voir `[API Request] POST /api/payments/lacaissepay/session` quand vous testez

3. **Testez directement Node.js** (via SSH) :
   ```bash
   curl http://localhost:PORT/api/ping
   ```
   Si ça fonctionne en localhost mais pas via le domaine, c'est un problème de proxy/Apache.

4. **Contactez le support Plesk/Contabo** si la configuration du reverse proxy ne fonctionne pas.

## Notes importantes

- Le `.htaccess` ne peut **pas** configurer le reverse proxy lui-même - il peut seulement s'assurer que les règles de réécriture n'interceptent pas `/api/*`
- Sur Plesk, le reverse proxy est généralement configuré automatiquement par le gestionnaire Node.js
- Si vous utilisez un `.htaccess` avec mot de passe, assurez-vous que les routes `/api/*` sont exclues (voir `CREATE_PASSWORD.md`)
