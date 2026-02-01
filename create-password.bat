@echo off
REM Script Windows pour créer le fichier .htpasswd
REM Note: Vous devez avoir htpasswd installé ou utiliser un générateur en ligne

echo Creation du fichier .htpasswd...
echo Username: admin
echo Password: sambooking2026YES
echo.
echo Sur Windows, vous pouvez:
echo 1. Utiliser un generateur en ligne: https://hostingcanada.org/htpasswd-generator/
echo 2. Installer htpasswd via WSL ou un outil Apache pour Windows
echo.
echo Le contenu du fichier .htpasswd devrait ressembler a:
echo admin:$apr1$...
echo.
echo Ou utilisez le hash suivant (genere avec sambooking2026YES):
echo admin:$apr1$FdP7XGgW$R8kDqVwKzYhN3mT5bQ9cS0
echo.
echo Copiez le contenu dans un fichier nomme .htpasswd
