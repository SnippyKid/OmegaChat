Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Omega Chat - Quick Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to kill process on port
function Kill-Port {
    param($Port)
    try {
        $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($processes) {
            foreach ($proc in $processes) {
                $pid = $proc.OwningProcess
                $procName = (Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName
                Write-Host "Found process $pid ($procName) on port $Port, killing..." -ForegroundColor Yellow
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "Successfully killed process $pid" -ForegroundColor Green
            }
            Start-Sleep -Seconds 1
        } else {
            Write-Host "Port $Port is free" -ForegroundColor Gray
        }
    } catch {
        Write-Host "Could not check port $Port: $_" -ForegroundColor Yellow
    }
}

# Kill processes on ports 5000 and 5173
Write-Host "Checking for processes on ports 5000 and 5173..." -ForegroundColor Yellow
Kill-Port -Port 5000
Kill-Port -Port 5173
Write-Host ""

# Check if node_modules exist
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing root dependencies..." -ForegroundColor Yellow
    npm install
}

if (-not (Test-Path "backend\node_modules")) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location backend
    npm install
    Set-Location ..
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

Write-Host ""
Write-Host "✅ All dependencies are installed!" -ForegroundColor Green
Write-Host ""
Write-Host "Starting development servers..." -ForegroundColor Cyan
Write-Host ""

# Start the dev servers
npm run dev
