@echo off
echo ========================================
echo   Omega Chat - Quick Start
echo ========================================
echo.

REM Kill any processes using port 5000
echo Checking for processes on port 5000...
set PORT5000_FOUND=0
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :5000 ^| findstr LISTENING') do (
    set PORT5000_FOUND=1
    echo Found process %%a on port 5000, killing...
    taskkill /F /PID %%a >nul 2>&1
    if errorlevel 1 (
        echo Warning: Could not kill process %%a - you may need admin rights
    ) else (
        echo Successfully killed process %%a
    )
)
if %PORT5000_FOUND%==0 (
    echo Port 5000 is free
)

REM Kill any processes using port 5173
echo Checking for processes on port 5173...
set PORT5173_FOUND=0
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :5173 ^| findstr LISTENING') do (
    set PORT5173_FOUND=1
    echo Found process %%a on port 5173, killing...
    taskkill /F /PID %%a >nul 2>&1
    if errorlevel 1 (
        echo Warning: Could not kill process %%a - you may need admin rights
    ) else (
        echo Successfully killed process %%a
    )
)
if %PORT5173_FOUND%==0 (
    echo Port 5173 is free
)

echo Waiting 2 seconds for ports to be released...
timeout /t 2 /nobreak >nul
echo.

REM Check if node_modules exist
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
)

if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo.
echo ✅ All dependencies are installed!
echo.
echo Starting development servers...
echo.

REM Start the dev servers
call npm run dev

pause
