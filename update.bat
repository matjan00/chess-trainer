@echo off
rem Pulls your new games, analyses them and rebuilds the trainer on this laptop.
rem Not needed any more for everyday use: GitHub does this automatically every night.
cd /d "%~dp0"
rem first take in what the nightly job already did, so the same games aren't analysed twice
"C:\Program Files\Git\cmd\git.exe" pull --rebase
"%LOCALAPPDATA%\Programs\Python\Python312\python.exe" update.py
echo.
pause
