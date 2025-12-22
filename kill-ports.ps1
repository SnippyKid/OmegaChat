Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Kill Processes on Ports 5000 & 5173" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Kill-Port {
    param($Port)
    $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($processes) {
        foreach ($proc in $processes) {
            $pid = $proc.OwningProcess
            $procName = (Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName
            Write-Host "Found process $pid ($procName) on port $Port" -ForegroundColor Yellow
            try {
                Stop-Process -Id $pid -Force
                Write-Host "Successfully killed process $pid" -ForegroundColor Green
            } catch {
                Write-Host "Failed to kill process $pid" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "No processes found on port $Port" -ForegroundColor Gray
    }
}

Write-Host "Checking port 5000..." -ForegroundColor Cyan
Kill-Port -Port 5000

Write-Host ""
Write-Host "Checking port 5173..." -ForegroundColor Cyan
Kill-Port -Port 5173

Write-Host ""
Write-Host "Done! Ports should be free now." -ForegroundColor Green
Write-Host ""
