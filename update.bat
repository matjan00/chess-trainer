@echo off
rem Double-click to pull your new games, analyse them and rebuild the trainer.
cd /d "%~dp0"
"%LOCALAPPDATA%\Programs\Python\Python312\python.exe" update.py
echo.
pause
