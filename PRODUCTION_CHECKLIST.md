# CHECKLIST DE MISE EN PRODUCTION - SAM'BOOKING

## 1. ACTIONS CRITIQUES (BLOQUANTES)

### 1.1 Appliquer les politiques RLS dans Supabase

**Fichier source**: `server/docs/SUPABASE_RLS_POLICIES.md`

1. Aller dans Supabase Dashboard > SQL Editor
2. Copier et exécuter le SQL pour chaque table
3. Vérifier dans Authentication > Policies que les politiques sont appliquées

```sql
-- Exemple pour la table reservations
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reservations" ON reservations
FOR SELECT USING (auth.uid() = user_id);
```

### 1.2 Installer et configurer Sentry

```bash
# Serveur
npm install @sentry/node

# Client
npm install @sentry/react
```

**Variables d'environnement à ajouter dans `.env`:**

```env
# Sentry - Error Monitoring
SENTRY_DSN=https://xxxxxxxx@o123456.ingest.sentry.io/1234567
VITE_SENTRY_DSN=https://xxxxxxxx@o123456.ingest.sentry.io/1234567
```

### 1.3 Configurer les variables de production

**Variables critiques à définir:**

```env
# OBLIGATOIRE - Sécurité
NODE_ENV=production
PAYMENTS_WEBHOOK_KEY=<clé_aléatoire_32_caractères_minimum>
ADMIN_DASHBOARD_PASSWORD=<mot_de_passe_fort_unique>

# OBLIGATOIRE - Firebase
FIREBASE_API_KEY=<votre_clé>
FIREBASE_AUTH_DOMAIN=<votre_domaine>
FIREBASE_PROJECT_ID=<votre_projet>

# OBLIGATOIRE - Supabase
SUPABASE_URL=<votre_url>
SUPABASE_SERVICE_ROLE_KEY=<votre_clé_service>
VITE_SUPABASE_ANON_KEY=<votre_clé_anon>

# OBLIGATOIRE - Paiements
LACAISSEPAY_API_KEY=<votre_clé_production>
LACAISSEPAY_MERCHANT_ID=<votre_merchant_id>

# OBLIGATOIRE - Email
RESEND_API_KEY=<votre_clé>
EMAIL_FROM=noreply@sambooking.ma

# Monitoring
SENTRY_DSN=<votre_dsn>
```

**Générer une clé webhook sécurisée:**

```bash
openssl rand -hex 32
# Exemple: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

---

## 2. ACTIONS IMPORTANTES (NON-BLOQUANTES)

### 2.1 Monitoring Uptime

Configurer un service de monitoring uptime:

- [UptimeRobot](https://uptimerobot.com/) (gratuit jusqu'à 50 monitors)
- [Pingdom](https://www.pingdom.com/)
- [StatusCake](https://www.statuscake.com/)

**Endpoints à monitorer:**

1. `https://sambooking.ma/api/health` - Santé générale
2. `https://sambooking.ma/api/admin/health` - API Admin
3. `https://sambooking.ma/api/consumer/auth/firebase/status` - Firebase Auth

### 2.2 Alertes paiement

Configurer des alertes dans LacaissePay dashboard pour:
- Échecs de paiement en masse (> 5 en 1 heure)
- Taux de conversion anormal (< 50%)
- Montants suspects

### 2.3 Backups Supabase

1. Aller dans Supabase Dashboard > Settings > Backups
2. Vérifier que les backups automatiques sont activés
3. Tester une restauration en staging

---

## 3. VÉRIFICATIONS PRÉ-LANCEMENT

### 3.1 Sécurité

- [ ] HTTPS forcé (HSTS activé)
- [ ] CSP headers configurés
- [ ] Rate limiting actif sur auth endpoints
- [ ] Pas de secrets dans le code source
- [ ] `.env` dans `.gitignore`

### 3.2 Fonctionnel

- [ ] Inscription/connexion fonctionne (Firebase)
- [ ] Recherche d'établissements fonctionne
- [ ] Réservation complète (avec paiement test)
- [ ] Emails de confirmation envoyés
- [ ] Annulation fonctionne
- [ ] Dashboard admin accessible

### 3.3 Paiements

- [ ] Mode production activé dans LacaissePay
- [ ] Webhook URL configurée en production
- [ ] Clé webhook différente de la clé de dev
- [ ] Test de paiement réel effectué

### 3.4 Légal

- [ ] CGU/CGV publiées et validées
- [ ] Politique de confidentialité à jour
- [ ] Bandeau cookies fonctionnel
- [ ] Mentions légales complètes

---

## 4. POST-LANCEMENT

### Première semaine

1. **Surveillance active** - Vérifier Sentry quotidiennement
2. **Logs de paiement** - Vérifier les transactions
3. **Feedback utilisateur** - Récolter les premiers retours

### Premier mois

1. **Analyse des erreurs** - Corriger les bugs récurrents
2. **Optimisation performance** - Analyser les temps de chargement
3. **Sécurité** - Vérifier les logs de tentatives suspectes

---

## 5. CONTACTS URGENCE

| Service | Contact |
|---------|---------|
| LacaissePay Support | support@lacaissepay.ma |
| Supabase Support | support@supabase.io |
| Firebase Support | firebase-support@google.com |

---

## 6. COMMANDES UTILES

```bash
# Démarrer en production
NODE_ENV=production npm run start

# Vérifier les logs
tail -f /var/log/sambooking/app.log

# Redémarrer le service
pm2 restart sambooking

# Vérifier le statut
pm2 status
```

---

## Verdict Final

✅ **Prêt pour la production** après:
1. Application des RLS Supabase
2. Configuration de Sentry
3. Vérification des variables d'environnement

⚠️ **Surveillance recommandée** pendant les 2 premières semaines.
