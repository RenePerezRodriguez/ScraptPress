# Script de prueba de endpoints - ScraptPress API
# Asegurate de que el servidor este corriendo en otra terminal: npm start

$apiKey = "a3f207ff5225d4fed2c8a7b331ffc0f3da0f1f106e113bd0840bf9c46cbbb35b"
$baseUrl = "http://localhost:3000/api"

Write-Host "`n===================================" -ForegroundColor Cyan
Write-Host "  ScraptPress API - Test Suite" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`n[1] Testing /api/health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    Write-Host "[OK] Health Status: $($health.status)" -ForegroundColor Green
    Write-Host "   Uptime: $([math]::Round($health.uptime, 2))s" -ForegroundColor Gray
    Write-Host "   Redis: $($health.services.redis.status)" -ForegroundColor Gray
    Write-Host "   Firestore: $($health.services.firestore.status)" -ForegroundColor Gray
} catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
}

# Test 2: Metrics
Write-Host "`n[2] Testing /api/metrics..." -ForegroundColor Yellow
try {
    $metrics = Invoke-RestMethod -Uri "$baseUrl/metrics" -Method GET
    Write-Host "[OK] Metrics retrieved" -ForegroundColor Green
    Write-Host "   Memory Used: $([math]::Round($metrics.current.memoryUsage.heapUsed / 1024 / 1024, 2)) MB" -ForegroundColor Gray
    Write-Host "   Uptime: $([math]::Round($metrics.current.uptime, 2))s" -ForegroundColor Gray
} catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
}

# Test 3: Popular Searches
Write-Host "`n[3] Testing /api/search/popular..." -ForegroundColor Yellow
try {
    $headers = @{
        "X-API-Key" = $apiKey
    }
    $popular = Invoke-RestMethod -Uri "$baseUrl/search/popular?limit=5" -Method GET -Headers $headers
    Write-Host "[OK] Popular searches retrieved: $($popular.count) results" -ForegroundColor Green
    if ($popular.searches.Length -gt 0) {
        Write-Host "   Top search: $($popular.searches[0].query) ($($popular.searches[0].count) searches)" -ForegroundColor Gray
    }
} catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
}

# Test 4: Vehicle Search (Simple)
Write-Host "`n[4] Testing /api/search/vehicles (toyota)..." -ForegroundColor Yellow
try {
    $headers = @{
        "X-API-Key" = $apiKey
    }
    $params = @{
        query = "toyota"
        page = 1
        limit = 10
    }
    
    Write-Host "   [SEARCHING] for 'toyota'... (this may take 30-60s)" -ForegroundColor Yellow
    Write-Host "   [WARNING] Browser will open in NON-HEADLESS mode" -ForegroundColor Cyan
    
    $search = Invoke-RestMethod -Uri "$baseUrl/search/vehicles" -Method GET -Headers $headers -Body $params -TimeoutSec 120
    
    Write-Host "[OK] Search completed!" -ForegroundColor Green
    Write-Host "   Found: $($search.total) vehicles" -ForegroundColor Gray
    Write-Host "   Returned: $($search.vehicles.Length) vehicles" -ForegroundColor Gray
    Write-Host "   Cached: $($search.cached)" -ForegroundColor Gray
    Write-Host "   Source: $($search.source)" -ForegroundColor Gray
    
    if ($search.vehicles.Length -gt 0) {
        $v = $search.vehicles[0]
        Write-Host "`n   First vehicle:" -ForegroundColor Gray
        Write-Host "   - $($v.year) $($v.make) $($v.model)" -ForegroundColor White
        Write-Host "   - Lot: $($v.lot_number)" -ForegroundColor White
        Write-Host "   - Location: $($v.location)" -ForegroundColor White
        Write-Host "   - Current Bid: `$$($v.current_bid)" -ForegroundColor White
    }
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: GDPR Consent Record
Write-Host "`n[5] Testing /api/gdpr/consent-record..." -ForegroundColor Yellow
try {
    $gdpr = Invoke-RestMethod -Uri "$baseUrl/gdpr/consent-record?email=test@example.com" -Method GET
    Write-Host "[OK] GDPR consent record retrieved" -ForegroundColor Green
    Write-Host "   Necessary cookies: $($gdpr.consents.necessary)" -ForegroundColor Gray
} catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
}

Write-Host "`n===================================" -ForegroundColor Cyan
Write-Host "  Tests completed!" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
