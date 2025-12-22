@echo off
echo ========================================
echo   Kill Processes on Ports 5000 & 5173
echo ========================================
echo.

echo Checking for processes on port 5000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    echo Found process %%a on port 5000
    taskkill /F /PID %%a
    if errorlevel 1 (
        echo Failed to kill process %%a
    ) else (
        echo Successfully killed process %%a
    )
)

echo.
echo Checking for processes on port 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo Found process %%a on port 5173
    taskkill /F /PID %%a
    if errorlevel 1 (
        echo Failed to kill process %%a
    ) else (
        echo Successfully killed process %%a
    )
)

echo.
echo Done! Ports should be free now.
echo.
pause
