# Test pagination with multiple pages
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

Write-Host "`n=== Testing Pagination ===" -ForegroundColor Cyan

# Test 1: Page 1 with 9 vehicles
Write-Host "`n1. Page 1 (limit=9)" -ForegroundColor Yellow
Write-Host "   Expected: 9 vehicles from cache or scraping 9" -ForegroundColor Gray

try {
    $start = Get-Date
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/search/hybrid?query=tesla&page=1&limit=9" -Method GET -Headers $headers -TimeoutSec 300
    $duration = ((Get-Date) - $start).TotalSeconds
    
    Write-Host "   [OK] Duration: $([math]::Round($duration))s" -ForegroundColor Green
    Write-Host "   Source: $($response.source), Cached: $($response.cached)" -ForegroundColor Cyan
    Write-Host "   Returned: $($response.returned)/$($response.total)" -ForegroundColor Green
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 2

# Test 2: Page 3 with 9 vehicles (needs 27 total)
Write-Host "`n2. Page 3 (limit=9, needs 27 total)" -ForegroundColor Yellow
Write-Host "   Expected: Should scrape 27 vehicles, return vehicles 19-27" -ForegroundColor Gray

try {
    $start = Get-Date
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/search/hybrid?query=porsche&page=3&limit=9" -Method GET -Headers $headers -TimeoutSec 300
    $duration = ((Get-Date) - $start).TotalSeconds
    
    Write-Host "   [OK] Duration: $([math]::Round($duration))s" -ForegroundColor Green
    Write-Host "   Source: $($response.source), Cached: $($response.cached)" -ForegroundColor Cyan
    Write-Host "   Returned: $($response.returned)/$($response.total)" -ForegroundColor Green
    Write-Host "   Message: $($response.message)" -ForegroundColor Gray
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 2

# Test 3: Page 1 with 100 vehicles
Write-Host "`n3. Page 1 (limit=100)" -ForegroundColor Yellow
Write-Host "   Expected: Should make 5 scrape calls (20×5=100)" -ForegroundColor Gray
Write-Host "   This will take ~5 minutes..." -ForegroundColor DarkGray

try {
    $start = Get-Date
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/search/hybrid?query=bmw&page=1&limit=100" -Method GET -Headers $headers -TimeoutSec 300
    $duration = ((Get-Date) - $start).TotalSeconds
    
    Write-Host "   [OK] Duration: $([math]::Round($duration))s ($([math]::Round($duration/60, 1))min)" -ForegroundColor Green
    Write-Host "   Source: $($response.source), Cached: $($response.cached)" -ForegroundColor Cyan
    Write-Host "   Returned: $($response.returned)/$($response.total)" -ForegroundColor Green
    Write-Host "   Message: $($response.message)" -ForegroundColor Gray
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Tests Complete ===" -ForegroundColor Cyan
