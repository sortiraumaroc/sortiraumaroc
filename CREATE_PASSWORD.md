# Création du fichier de mot de passe pour .htaccess

Pour protéger le site avec un mot de passe, vous devez créer un fichier `.htpasswd` avec le mot de passe hashé.

## Option 1 : Via ligne de commande (recommandé)

### Sur Linux/Mac ou via SSH sur le serveur :

```bash
# Installer htpasswd si nécessaire (sur Ubuntu/Debian)
sudo apt-get install apache2-utils

# Créer le fichier .htpasswd avec l'utilisateur "admin" et le mot de passe
htpasswd -c .htpasswd admin
# Entrez le mot de passe : sambooking2026YES

# Ou directement avec le mot de passe en ligne de commande (moins sécurisé)
htpasswd -cb .htpasswd admin sambooking2026YES
```

### Sur Windows :

1. Téléchargez htpasswd depuis Apache ou utilisez un générateur en ligne
2. Ou utilisez PowerShell avec OpenSSL si disponible

## Option 2 : Générateur en ligne

1. Allez sur https://hostingcanada.org/htpasswd-generator/
2. Username : `admin` (ou le nom de votre choix)
3. Password : `sambooking2026YES`
4. Copiez le résultat (format : `admin:$apr1$...`)

## Option 3 : Créer manuellement avec htpasswd

Le fichier `.htpasswd` doit être créé dans un répertoire accessible par Apache mais **PAS** dans le répertoire public (httpdocs).

**Recommandation** : Créez-le dans un répertoire parent, par exemple :
```
/var/www/vhosts/votre-domaine.com/.htpasswd
```

**IMPORTANT** : Le fichier `.htpasswd` ne doit PAS être accessible via le web. Assurez-vous qu'il soit en dehors du répertoire `httpdocs/`.

## Configuration finale

1. Créez le fichier `.htpasswd` avec le mot de passe
2. Dans `.htaccess`, décommentez les lignes de protection :
```apache
<IfModule mod_auth_basic.c>
  AuthType Basic
  AuthName "Accès protégé - Sam'Booking"
  AuthUserFile /chemin/vers/.htpasswd
  Require valid-user
</IfModule>
```

3. Remplacez `/chemin/vers/.htpasswd` par le chemin absolu réel de votre fichier

**Exemple** :
```apache
AuthUserFile /var/www/vhosts/votre-domaine.com/.htpasswd
```

## Vérification

Après activation, toute visite du site demandera :
- Username : `admin` (ou celui que vous avez choisi)
- Password : `sambooking2026YES`

## Résolution des erreurs HTTP 403

Si vous obtenez une erreur **HTTP 403** après avoir activé la protection par mot de passe :

1. **Vérifiez les permissions du fichier `.htpasswd`** :
   ```bash
   chmod 644 .htpasswd
   chown www-data:www-data .htpasswd  # ou votre utilisateur web
   ```

2. **Vérifiez que le chemin dans `.htaccess` est absolu et correct** :
   ```apache
   AuthUserFile /var/www/vhosts/votre-domaine.com/.htpasswd
   ```
   Le chemin doit être **absolu** (commence par `/`), pas relatif.

3. **Testez si le fichier est accessible** :
   ```bash
   cat /var/www/vhosts/votre-domaine.com/.htpasswd
   # Devrait afficher : admin:$apr1$...
   ```

4. **Si les routes API retournent 403**, vérifiez que l'exclusion fonctionne :
   - Testez : `curl https://votre-domaine.com/api/ping`
   - Cela devrait fonctionner sans authentification

5. **Si les routes API retournent toujours 401 ou 403**, essayez `.htaccess.with-password-FINAL` :
   - Cette version utilise `RequireAny` avec `Require expr` pour exclure explicitement les routes API
   - Si cela ne fonctionne toujours pas, il se peut que votre version d'Apache ne supporte pas `Require expr`
   - Dans ce cas, il faudra configurer l'exclusion au niveau d'Apache (hors .htaccess) ou utiliser un reverse proxy

## Désactiver temporairement

Si vous voulez désactiver la protection temporairement, commentez à nouveau les lignes dans `.htaccess` :
```apache
# <IfModule mod_auth_basic.c>
#   ...
# </IfModule>
```
