# API Health Check Script for Windows PowerShell

Write-Host "🔍 Checking API Health..." -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get -ErrorAction Stop
    
    Write-Host "✅ API Status: $($response.status)" -ForegroundColor Green
    Write-Host "📝 Message: $($response.message)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🗄️  Database Status:" -ForegroundColor Cyan
    Write-Host "   Status: $($response.database.status)" -ForegroundColor $(if ($response.database.connected) { "Green" } else { "Red" })
    Write-Host "   Connected: $($response.database.connected)" -ForegroundColor $(if ($response.database.connected) { "Green" } else { "Red" })
    Write-Host "   ReadyState: $($response.database.readyState)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "⏰ Timestamp: $($response.timestamp)" -ForegroundColor Gray
    
    if (-not $response.database.connected) {
        Write-Host ""
        Write-Host "⚠️  WARNING: MongoDB is not connected!" -ForegroundColor Red
        Write-Host "   Please check:" -ForegroundColor Yellow
        Write-Host "   1. MongoDB is running (if local)" -ForegroundColor Yellow
        Write-Host "   2. MongoDB Atlas network access is configured" -ForegroundColor Yellow
        Write-Host "   3. Connection string in backend/.env is correct" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error: Could not connect to API" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible reasons:" -ForegroundColor Yellow
    Write-Host "1. Backend server is not running" -ForegroundColor Yellow
    Write-Host "   → Start it with: npm run dev (from root)" -ForegroundColor Yellow
    Write-Host "   → Or: cd backend && npm run dev" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "2. Backend is running on a different port" -ForegroundColor Yellow
    Write-Host "   → Check backend/.env for PORT setting" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "3. Firewall is blocking the connection" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
}

