@echo off
rem Double-click after Claude made changes (or after update.bat) to put the new version online.
rem Phones show "A new version is ready" the next time the app is opened with a connection.
rem New games are also added automatically every night by GitHub, so this is rarely needed.
cd /d "%~dp0"
set GIT="C:\Program Files\Git\cmd\git.exe"
%GIT% add -A
%GIT% commit -m "Update chess trainer"
rem take in anything the nightly job published first
%GIT% pull --rebase
%GIT% push
echo.
echo Done. The website updates within about a minute.
pause
