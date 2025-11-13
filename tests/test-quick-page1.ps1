# Quick test - Page 1 with 9 vehicles
$ErrorActionPreference = "Stop"

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

Write-Host "Testing Page 1 with 9 vehicles..." -ForegroundColor Cyan
Write-Host "Query: tesla" -ForegroundColor Gray

try {
    $start = Get-Date
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/search/hybrid?query=tesla&page=1&limit=9" -Method GET -Headers $headers -TimeoutSec 300
    $duration = ((Get-Date) - $start).TotalSeconds
    
    Write-Host "`n[SUCCESS]" -ForegroundColor Green
    Write-Host "Duration: $([math]::Round($duration))s" -ForegroundColor Yellow
    Write-Host "Source: $($response.source)" -ForegroundColor Cyan
    Write-Host "Cached: $($response.cached)" -ForegroundColor $(if ($response.cached) { "Green" } else { "Red" })
    Write-Host "Returned: $($response.returned)" -ForegroundColor Green
    Write-Host "Total: $($response.total)" -ForegroundColor Gray
    Write-Host "Page: $($response.page)/$($response.totalPages)" -ForegroundColor Gray
    
    if ($response.message) {
        Write-Host "`nMessage: $($response.message)" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
