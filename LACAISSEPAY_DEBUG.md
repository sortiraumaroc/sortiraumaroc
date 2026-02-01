# 🔍 Diagnostic : Erreur spécifique pour `/api/payments/lacaissepay/session`

## Problème

Cette route spécifique reçoit du **HTML** au lieu de JSON, alors que **toutes les autres API fonctionnent**. Cela signifie que le reverse proxy fonctionne, mais quelque chose intercepte spécifiquement cette route.

## Causes possibles

### 1. Timeout Apache

Cette route fait un `fetch` externe vers LacaissePay qui peut prendre du temps. Si Apache a un timeout court, il peut renvoyer une page d'erreur HTML avant que Node.js ne réponde.

**Solution** : Augmenter le timeout Apache pour cette route spécifique.

### 2. Taille du body

Cette route peut envoyer un body plus volumineux que les autres. Si Apache a une limite de taille, il peut renvoyer une erreur HTML.

**Solution** : Vérifier les limites de taille dans Apache.

### 3. Règle Apache spécifique

Une règle dans `.htaccess` ou la configuration Apache pourrait intercepter spécifiquement cette route.

**Solution** : Vérifier les règles Apache.

## Diagnostic étape par étape

### Étape 1 : Vérifier les logs Node.js

Dans Plesk : **Domaines** > `sambooking.ma` > **Node.js** > **Logs**

Cherchez :
```
[API Request] POST /api/payments/lacaissepay/session
[LacaissePay] Session creation request received
```

- ✅ **Si vous voyez ces logs** : La requête atteint Node.js. Le problème vient de la route elle-même ou du fetch externe.
- ❌ **Si vous ne voyez pas ces logs** : La requête n'atteint pas Node.js. Le problème vient d'Apache ou du reverse proxy.

### Étape 2 : Tester directement Node.js

Via SSH :
```bash
curl -X POST http://localhost:PORT/api/payments/lacaissepay/session \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST123",
    "externalReference": "TEST123",
    "amount": 100,
    "customerEmail": "test@example.com",
    "customerPhone": "+212611159538",
    "customerFirstName": "Test",
    "customerLastName": "User",
    "acceptUrl": "https://sambooking.ma/success",
    "declineUrl": "https://sambooking.ma/failed",
    "notificationUrl": "https://sambooking.ma/api/payments/webhook"
  }'
```

- ✅ **Si ça fonctionne** : Node.js fonctionne. Le problème vient d'Apache/reverse proxy.
- ❌ **Si ça ne fonctionne pas** : Le problème vient de la route elle-même.

### Étape 3 : Vérifier les logs Apache

Dans Plesk : **Domaines** > `sambooking.ma` > **Logs** > **Apache Error Log**

Cherchez des erreurs liées à :
- Timeout
- Body too large
- Proxy errors
- `/api/payments/lacaissepay/session`

### Étape 4 : Tester via le domaine

```bash
curl -X POST https://sambooking.ma/api/payments/lacaissepay/session \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST123",
    "externalReference": "TEST123",
    "amount": 100,
    "customerEmail": "test@example.com",
    "customerPhone": "+212611159538",
    "customerFirstName": "Test",
    "customerLastName": "User",
    "acceptUrl": "https://sambooking.ma/success",
    "declineUrl": "https://sambooking.ma/failed",
    "notificationUrl": "https://sambooking.ma/api/payments/webhook"
  }' -v
```

L'option `-v` affichera les headers de réponse. Vérifiez :
- Le status code (200, 500, 404, etc.)
- Le Content-Type (devrait être `application/json`, pas `text/html`)
- Le body (devrait être du JSON, pas du HTML)

## Solutions

### Solution 1 : Augmenter le timeout Apache

Dans Plesk : **Domaines** > `sambooking.ma` > **Apache & Nginx Settings** > **Additional Apache directives**

Ajoutez :
```apache
# Augmenter le timeout pour les routes API
Timeout 300
ProxyTimeout 300

# Spécifiquement pour cette route
<LocationMatch "^/api/payments/lacaissepay/session">
  ProxyTimeout 300
</LocationMatch>
```

### Solution 2 : Augmenter la limite de taille du body

Dans Plesk : **Domaines** > `sambooking.ma` > **Apache & Nginx Settings** > **Additional Apache directives**

Ajoutez :
```apache
# Augmenter la limite de taille du body
LimitRequestBody 10485760  # 10MB
```

### Solution 3 : Vérifier le `.htaccess`

Assurez-vous que le `.htaccess` n'a pas de règle qui intercepte spécifiquement cette route. La règle `/api/` devrait couvrir toutes les routes API, y compris celle-ci.

### Solution 4 : Ajouter des logs spécifiques

J'ai ajouté des logs dans `server/routes/lacaissepay.ts`. Après avoir redéployé, vérifiez les logs Node.js pour voir :
- Si la requête atteint la route
- Les headers reçus
- Si le fetch externe vers LacaissePay fonctionne

## Vérification après correction

1. ✅ Les logs Node.js montrent `[LacaissePay] Session creation request received`
2. ✅ Le test `curl` via le domaine retourne du JSON (pas du HTML)
3. ✅ Le frontend peut créer une session sans erreur "Unexpected token '<'"

## Si le problème persiste

1. **Vérifiez les logs Node.js** - Est-ce que la requête atteint Node.js ?
2. **Vérifiez les logs Apache** - Y a-t-il des erreurs de timeout ou de proxy ?
3. **Testez directement Node.js** - Est-ce que la route fonctionne en localhost ?
4. **Contactez le support** - Si aucune solution ne fonctionne, contactez le support Plesk/Contabo avec :
   - Les logs Node.js
   - Les logs Apache
   - Le résultat du test `curl`
