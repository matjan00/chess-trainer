@echo off
rem Double-click after update.bat (or after Claude made changes) to put the new version online.
rem Phones show "A new version is ready" the next time the app is opened with a connection.
cd /d "%~dp0"
set GIT="C:\Program Files\Git\cmd\git.exe"
%GIT% add -A
%GIT% commit -m "Update chess trainer"
%GIT% push
echo.
echo Done. The website updates within about a minute.
pause
