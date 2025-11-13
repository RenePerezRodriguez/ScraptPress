# Test Vehicle Details Endpoints
# Tests the on-demand vehicle details fetching

$API_KEY = "0d2366db7108a67dcc49e309128808f566c092cb9afa8fc789b33b92ee0a863e"
$BASE_URL = "http://localhost:3000/api"

Write-Host "`n=== Testing Vehicle Details Endpoints ===" -ForegroundColor Cyan
Write-Host "Testing on-demand extended data fetching`n" -ForegroundColor Gray

# Test 1: Search for vehicles (get basic data)
Write-Host "Test 1: Search for Porsche (basic data)" -ForegroundColor Yellow
$searchResponse = Invoke-RestMethod -Uri "$BASE_URL/search/hybrid?query=porsche&page=1&limit=5" `
    -Method GET `
    -Headers @{"X-API-Key"=$API_KEY}

Write-Host "  Found: $($searchResponse.returned) vehicles" -ForegroundColor Green
$firstVehicle = $searchResponse.vehicles[0]
$lotNumber = $firstVehicle.lot_number

Write-Host "  First vehicle: $($firstVehicle.make) $($firstVehicle.vehicle_model) ($lotNumber)" -ForegroundColor Cyan
Write-Host "  Images in gallery: $($firstVehicle.images_gallery.Count)" -ForegroundColor Gray
Write-Host "  VIN: $($firstVehicle.vin)" -ForegroundColor Gray

# Test 2: Get basic vehicle info from cache
Write-Host "`nTest 2: Get vehicle $lotNumber from cache" -ForegroundColor Yellow
try {
    $vehicleResponse = Invoke-RestMethod -Uri "$BASE_URL/vehicle/$lotNumber" `
        -Method GET `
        -Headers @{"X-API-Key"=$API_KEY}
    
    Write-Host "  ✅ Found in cache" -ForegroundColor Green
    Write-Host "  Source: $($vehicleResponse.source)" -ForegroundColor Cyan
} catch {
    Write-Host "  ⚠️ Not found in cache (expected if first run)" -ForegroundColor Yellow
}

# Test 3: Fetch extended details (VIN, full gallery, highlights)
Write-Host "`nTest 3: Fetch extended details for $lotNumber" -ForegroundColor Yellow
Write-Host "  This may take 10-20 seconds..." -ForegroundColor Gray

$startTime = Get-Date

try {
    $detailsResponse = Invoke-RestMethod -Uri "$BASE_URL/vehicle/$lotNumber/details" `
        -Method GET `
        -Headers @{"X-API-Key"=$API_KEY}
    
    $duration = (Get-Date) - $startTime
    
    Write-Host "  ✅ Extended details fetched in $([int]$duration.TotalSeconds)s" -ForegroundColor Green
    Write-Host "  Source: $($detailsResponse.source)" -ForegroundColor Cyan
    Write-Host "  Cached: $($detailsResponse.cached)" -ForegroundColor Cyan
    
    $vehicle = $detailsResponse.vehicle
    Write-Host "`n  Extended Data:" -ForegroundColor Magenta
    Write-Host "    VIN: $($vehicle.vin)" -ForegroundColor White
    Write-Host "    Images in gallery: $($vehicle.images_gallery.Count)" -ForegroundColor White
    Write-Host "    Highlights: $($vehicle.highlights.Count)" -ForegroundColor White
    Write-Host "    Engine video: $($vehicle.engine_video)" -ForegroundColor White
    
} catch {
    $duration = (Get-Date) - $startTime
    Write-Host "  ❌ Failed after $([int]$duration.TotalSeconds)s" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Second request should be instant (from cache)
Write-Host "`nTest 4: Re-fetch details (should be cached)" -ForegroundColor Yellow

$startTime = Get-Date

try {
    $cachedDetailsResponse = Invoke-RestMethod -Uri "$BASE_URL/vehicle/$lotNumber/details" `
        -Method GET `
        -Headers @{"X-API-Key"=$API_KEY}
    
    $duration = (Get-Date) - $startTime
    
    Write-Host "  ✅ Details fetched in $([int]$duration.TotalSeconds)s" -ForegroundColor Green
    Write-Host "  Source: $($cachedDetailsResponse.source)" -ForegroundColor Cyan
    Write-Host "  Cached: $($cachedDetailsResponse.cached)" -ForegroundColor Cyan
    
    if ($cachedDetailsResponse.cached) {
        Write-Host "  🚀 Cache hit! Much faster!" -ForegroundColor Green
    }
    
} catch {
    Write-Host "  ❌ Failed" -ForegroundColor Red
}

# Test 5: Test with force_fresh parameter
Write-Host "`nTest 5: Force fresh scrape with force_fresh=true" -ForegroundColor Yellow
Write-Host "  This will take 10-20 seconds again..." -ForegroundColor Gray

$startTime = Get-Date

try {
    $freshResponse = Invoke-RestMethod -Uri "$BASE_URL/vehicle/$lotNumber/details?force_fresh=true" `
        -Method GET `
        -Headers @{"X-API-Key"=$API_KEY}
    
    $duration = (Get-Date) - $startTime
    
    Write-Host "  ✅ Fresh data fetched in $([int]$duration.TotalSeconds)s" -ForegroundColor Green
    Write-Host "  Source: $($freshResponse.source)" -ForegroundColor Cyan
    Write-Host "  Scrape duration: $($freshResponse.scrapeDurationSeconds)s" -ForegroundColor Cyan
    
} catch {
    $duration = (Get-Date) - $startTime
    Write-Host "  ❌ Failed after $([int]$duration.TotalSeconds)s" -ForegroundColor Red
}

Write-Host "`n=== All Tests Complete ===" -ForegroundColor Cyan
