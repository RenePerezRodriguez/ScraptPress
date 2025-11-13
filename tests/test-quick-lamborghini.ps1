# Quick test - Lamborghini scraping
$ErrorActionPreference = "Stop"

# Load API key
$envPath = Join-Path $PSScriptRoot ".." | Join-Path -ChildPath ".env"
$apiKey = ""
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^API_KEY=(.+)$') {
            $apiKey = $matches[1]
        }
    }
}

$headers = @{
    "Content-Type" = "application/json"
    "X-API-Key" = $apiKey
}

Write-Host "Testing Lamborghini scraping (this will take 1-2 minutes)..." -ForegroundColor Cyan
Write-Host "Started at: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray

try {
    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/search/hybrid?query=lamborghini&page=1&limit=3" -Method GET -Headers $headers -TimeoutSec 300
    $duration = ((Get-Date) - $startTime).TotalSeconds
    
    Write-Host "`n[SUCCESS] Scraping complete!" -ForegroundColor Green
    Write-Host "Duration: $([math]::Round($duration)) seconds ($([math]::Round($duration/60, 1)) minutes)" -ForegroundColor Yellow
    Write-Host "Source: $($response.source)" -ForegroundColor Cyan
    Write-Host "Cached: $($response.cached)" -ForegroundColor $(if ($response.cached) { "Red" } else { "Green" })
    Write-Host "Vehicles returned: $($response.returned)" -ForegroundColor Green
    Write-Host "Total found: $($response.total)" -ForegroundColor Gray
    
    if ($response.message) {
        Write-Host "`nMessage: $($response.message)" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
