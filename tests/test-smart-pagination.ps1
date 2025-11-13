# Test: Page 1 with 10 results (should scrape 1 Copart page = 20 vehicles)
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

Write-Host "`n=== Test: Smart Pagination ===" -ForegroundColor Cyan
Write-Host "Query: ferrari" -ForegroundColor Gray
Write-Host "Expected: Scrape 1 Copart page (20 vehicles), return 10" -ForegroundColor Yellow

try {
    $start = Get-Date
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/search/hybrid?query=ferrari&page=1&limit=10" -Method GET -Headers $headers -TimeoutSec 300
    $duration = ((Get-Date) - $start).TotalSeconds
    
    Write-Host "`n[SUCCESS]" -ForegroundColor Green
    Write-Host "Duration: $([math]::Round($duration))s" -ForegroundColor Yellow
    Write-Host "Source: $($response.source)" -ForegroundColor Cyan
    Write-Host "Cached: $($response.cached)" -ForegroundColor $(if ($response.cached) { "Green" } else { "Red" })
    Write-Host "Returned: $($response.returned)" -ForegroundColor Green
    Write-Host "Total scraped: $($response.total)" -ForegroundColor Gray
    Write-Host "Copart pages scraped: $($response.copartPagesScraped)" -ForegroundColor Cyan
    Write-Host "`nMessage: $($response.message)" -ForegroundColor Yellow
    
    Write-Host "`n✅ Perfect! Now page 2 should be instant from cache..." -ForegroundColor Green
    
} catch {
    Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 2

# Test page 2 (should use cache)
Write-Host "`n=== Test: Page 2 (from cache) ===" -ForegroundColor Cyan
Write-Host "Expected: < 2 seconds from Firestore cache" -ForegroundColor Yellow

try {
    $start = Get-Date
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/search/hybrid?query=ferrari&page=2&limit=10" -Method GET -Headers $headers -TimeoutSec 300
    $duration = ((Get-Date) - $start).TotalSeconds
    
    Write-Host "`n[SUCCESS]" -ForegroundColor Green
    Write-Host "Duration: $([math]::Round($duration))s" -ForegroundColor $(if ($duration -lt 2) { "Green" } else { "Yellow" })
    Write-Host "Source: $($response.source)" -ForegroundColor Cyan
    Write-Host "Cached: $($response.cached)" -ForegroundColor $(if ($response.cached) { "Green" } else { "Red" })
    Write-Host "Returned: $($response.returned)" -ForegroundColor Green
    
    if ($response.cached -and $duration -lt 2) {
        Write-Host "`n🚀 PERFECT! Page 2 was instant from cache!" -ForegroundColor Green
    }
    
} catch {
    Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
