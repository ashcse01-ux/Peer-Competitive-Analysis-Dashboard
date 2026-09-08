@echo off
cd /d "%~dp0"
echo.
echo  FreshBus Dashboard - starting dev server...
echo  Open: http://localhost:3000/redbus
echo  Keep this window open while using the app.
echo.
call npm run start
