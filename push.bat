@echo off
cd /d "%~dp0"
echo === Envoi des modifications vers GitHub ===
git add -A
git commit -m "Mise a jour PerformTrack"
git push
echo.
echo === Termine ! Vercel va redeployer automatiquement (1-2 min) ===
pause
