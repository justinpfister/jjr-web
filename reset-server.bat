@echo off
echo Killing processes on port 3000...

REM Find and kill processes using port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    echo Killing process %%a
    taskkill /F /PID %%a >nul 2>&1
)

REM Wait a moment for processes to fully terminate
timeout /t 2 /nobreak >nul

echo Starting server...
npm run api
