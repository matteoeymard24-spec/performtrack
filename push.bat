@echo off
cd /d "%~dp0"
echo ===================================
echo   Envoi des changements vers GitHub
echo ===================================
echo.

git add .
git commit -m "Mise a jour"
git push

echo.
echo ===================================
echo   Termine. Verifie le resultat au-dessus.
echo ===================================
pause
