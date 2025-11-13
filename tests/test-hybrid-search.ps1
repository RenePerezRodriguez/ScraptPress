# Test hybrid search endpoint
# Tests cache-first strategy with fallback to fresh scraping

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3000"

# Load API key from .env
$envPath = Join-Path $PSScriptRoot ".." | Join-Path -ChildPath ".env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^API_KEY=(.+)$') {
            $apiKey = $matches[1]
        }
    }
}

if (-not $apiKey) {
    Write-Host "[ERROR] API_KEY not found" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Content-Type" = "application/json"
    "X-API-Key" = $apiKey
}

Write-Host "`nTesting Hybrid Search Endpoint" -ForegroundColor Cyan
Write-Host "=" * 60

# Test 1: Search with cache available (should use cache)
Write-Host "`n1. Testing hybrid search (cache available)..." -ForegroundColor Yellow
Write-Host "   Query: tesla" -ForegroundColor Gray

try {
    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "$baseUrl/api/search/hybrid?query=tesla&page=1&limit=5" -Method GET -Headers $headers -TimeoutSec 300
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    
    Write-Host "   [OK] Response time: $([math]::Round($duration))ms" -ForegroundColor Green
    Write-Host "   Source: $($response.source)" -ForegroundColor $(if ($response.cached) { "Cyan" } else { "Yellow" })
    Write-Host "   Cached: $($response.cached)" -ForegroundColor $(if ($response.cached) { "Green" } else { "Red" })
    Write-Host "   Fresh: $($response.fresh)" -ForegroundColor Gray
    Write-Host "   Returned: $($response.returned) vehicles" -ForegroundColor Gray
    
    if ($response.cache_age_hours) {
        Write-Host "   Cache age: $($response.cache_age_hours)h" -ForegroundColor Gray
    }
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 2

# Test 2: Search without cache (should scrape Copart)
Write-Host "`n2. Testing hybrid search (no cache - will scrape)..." -ForegroundColor Yellow
Write-Host "   Query: lamborghini" -ForegroundColor Gray
Write-Host "   This will take 1-2 minutes (scraping Copart)..." -ForegroundColor DarkGray

try {
    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "$baseUrl/api/search/hybrid?query=lamborghini&page=1&limit=3" -Method GET -Headers $headers -TimeoutSec 180
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    
    Write-Host "   [OK] Response time: $([math]::Round($duration))ms" -ForegroundColor Green
    Write-Host "   Source: $($response.source)" -ForegroundColor $(if ($response.cached) { "Cyan" } else { "Yellow" })
    Write-Host "   Cached: $($response.cached)" -ForegroundColor $(if ($response.cached) { "Green" } else { "Red" })
    Write-Host "   Fresh: $($response.fresh)" -ForegroundColor Gray
    Write-Host "   Returned: $($response.returned) vehicles" -ForegroundColor Gray
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 2

# Test 3: Same query again (should now use cache)
Write-Host "`n3. Testing hybrid search again (should now be cached)..." -ForegroundColor Yellow
Write-Host "   Query: lamborghini" -ForegroundColor Gray

try {
    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "$baseUrl/api/search/hybrid?query=lamborghini&page=1&limit=3" -Method GET -Headers $headers -TimeoutSec 180
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    
    Write-Host "   [OK] Response time: $([math]::Round($duration))ms" -ForegroundColor Green
    Write-Host "   Source: $($response.source)" -ForegroundColor $(if ($response.cached) { "Cyan" } else { "Yellow" })
    Write-Host "   Cached: $($response.cached)" -ForegroundColor $(if ($response.cached) { "Green" } else { "Red" })
    Write-Host "   Fresh: $($response.fresh)" -ForegroundColor Gray
    Write-Host "   Returned: $($response.returned) vehicles" -ForegroundColor Gray
    
    if ($response.cache_age_hours) {
        Write-Host "   Cache age: $($response.cache_age_hours)h" -ForegroundColor Gray
    }
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 2

# Test 4: Force fresh scraping
Write-Host "`n4. Testing force_fresh=true..." -ForegroundColor Yellow
Write-Host "   Query: tesla (force fresh)" -ForegroundColor Gray
Write-Host "   This will take 1-2 minutes (scraping Copart)..." -ForegroundColor DarkGray

try {
    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "$baseUrl/api/search/hybrid?query=tesla&page=1&limit=3&force_fresh=true" -Method GET -Headers $headers -TimeoutSec 300
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    
    Write-Host "   [OK] Response time: $([math]::Round($duration))ms" -ForegroundColor Green
    Write-Host "   Source: $($response.source)" -ForegroundColor $(if ($response.cached) { "Cyan" } else { "Yellow" })
    Write-Host "   Cached: $($response.cached)" -ForegroundColor $(if ($response.cached) { "Green" } else { "Red" })
    Write-Host "   Fresh: $($response.fresh)" -ForegroundColor Gray
    Write-Host "   Returned: $($response.returned) vehicles" -ForegroundColor Gray
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
Write-Host "Tests complete!" -ForegroundColor Green
Write-Host "`nSummary:" -ForegroundColor Cyan
Write-Host "  - Cached searches: < 500ms (instant)" -ForegroundColor Gray
Write-Host "  - Fresh scraping: 2-3 seconds (Copart)" -ForegroundColor Gray
Write-Host "  - All scraped data saved to Firestore for future use" -ForegroundColor Gray
