#!/bin/bash
# Script pour créer le fichier .htpasswd avec le mot de passe

USERNAME="admin"
PASSWORD="sambooking2026YES"

echo "Création du fichier .htpasswd..."
echo "Username: $USERNAME"
echo "Password: $PASSWORD"

# Vérifier si htpasswd est installé
if ! command -v htpasswd &> /dev/null; then
    echo "❌ htpasswd n'est pas installé."
    echo "Sur Ubuntu/Debian, installez avec: sudo apt-get install apache2-utils"
    echo "Sur CentOS/RHEL, installez avec: sudo yum install httpd-tools"
    exit 1
fi

# Créer le fichier .htpasswd
htpasswd -cb .htpasswd "$USERNAME" "$PASSWORD"

if [ $? -eq 0 ]; then
    echo "✅ Fichier .htpasswd créé avec succès !"
    echo ""
    echo "📋 Prochaines étapes :"
    echo "1. Déplacez .htpasswd dans un répertoire sécurisé (hors de httpdocs)"
    echo "2. Notez le chemin absolu du fichier"
    echo "3. Dans .htaccess, remplacez /chemin/vers/.htpasswd par le chemin réel"
    echo "4. Décommentez les lignes de protection dans .htaccess"
    echo ""
    echo "⚠️  IMPORTANT : Le fichier .htpasswd ne doit PAS être accessible via le web !"
else
    echo "❌ Erreur lors de la création du fichier .htpasswd"
    exit 1
fi
