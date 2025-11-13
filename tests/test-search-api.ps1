# Test de los nuevos endpoints de búsqueda
# Test para ScraptPress Backend API

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Test de API - ScraptPress Backend" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$BASE_URL = "http://localhost:3000/api"
$API_KEY = "test-api-key-123" # Cambiar por tu API_KEY real

# Función para hacer requests
function Invoke-ApiRequest {
    param(
        [string]$Method = "GET",
        [string]$Endpoint,
        [hashtable]$Body = $null,
        [string]$Description
    )
    
    Write-Host "📡 $Description..." -ForegroundColor Yellow
    Write-Host "   $Method $Endpoint" -ForegroundColor Gray
    
    try {
        $headers = @{
            "X-API-Key" = $API_KEY
            "Content-Type" = "application/json"
        }
        
        $params = @{
            Uri = "$BASE_URL$Endpoint"
            Method = $Method
            Headers = $headers
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        
        Write-Host "   ✅ Success!" -ForegroundColor Green
        Write-Host ""
        Write-Host "   Response:" -ForegroundColor Cyan
        Write-Host ($response | ConvertTo-Json -Depth 5) -ForegroundColor White
        Write-Host ""
        
        return $response
    }
    catch {
        Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
        Write-Host ""
        return $null
    }
}

# Test 1: Búsqueda fresca (Scraping directo de Copart)
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TEST 1: Fresh Scraping (Copart)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$freshResult = Invoke-ApiRequest -Method POST -Endpoint "/scraper/vehicles" -Body @{
    query = "tesla"
    count = 5
    page = 1
} -Description "Scraping fresh data from Copart"

Start-Sleep -Seconds 2

# Test 2: Búsqueda en caché (Firestore)
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TEST 2: Cached Search (Firestore)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$cachedResult = Invoke-ApiRequest -Method GET -Endpoint "/search/cached?query=tesla&page=1&limit=5" -Description "Searching cached data from Firestore"

Start-Sleep -Seconds 1

# Test 3: Estadísticas de búsqueda
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TEST 3: Search Statistics" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$statsResult = Invoke-ApiRequest -Method GET -Endpoint "/search/stats?query=tesla" -Description "Getting search statistics"

Start-Sleep -Seconds 1

# Test 4: Verificar diferencias (Fresh vs Cached)
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TEST 4: Comparison (Fresh vs Cached)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

if ($freshResult -and $cachedResult) {
    Write-Host "Fresh results:" -ForegroundColor Yellow
    Write-Host "  Source: $($freshResult.source)" -ForegroundColor White
    Write-Host "  Fresh: $($freshResult.fresh)" -ForegroundColor White
    Write-Host "  Returned: $($freshResult.returned)" -ForegroundColor White
    Write-Host "  Timestamp: $($freshResult.timestamp)" -ForegroundColor White
    Write-Host ""
    
    Write-Host "Cached results:" -ForegroundColor Yellow
    Write-Host "  Source: $($cachedResult.source)" -ForegroundColor White
    Write-Host "  Cached: $($cachedResult.cached)" -ForegroundColor White
    Write-Host "  Returned: $($cachedResult.returned)" -ForegroundColor White
    Write-Host "  Total in DB: $($cachedResult.total)" -ForegroundColor White
    Write-Host "  Timestamp: $($cachedResult.timestamp)" -ForegroundColor White
    Write-Host ""
    
    if ($cachedResult.returned -gt 0) {
        Write-Host "  ✅ Vehicles found in Firestore cache!" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  No vehicles in cache yet (they will be saved in background)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  Could not compare results" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Tests Complete!" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Resumen
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "   - Fresh scraping: " -NoNewline
if ($freshResult) { Write-Host "✅" -ForegroundColor Green } else { Write-Host "❌" -ForegroundColor Red }

Write-Host "   - Cached search: " -NoNewline
if ($cachedResult) { Write-Host "✅" -ForegroundColor Green } else { Write-Host "❌" -ForegroundColor Red }

Write-Host "   - Statistics: " -NoNewline
if ($statsResult) { Write-Host "✅" -ForegroundColor Green } else { Write-Host "❌" -ForegroundColor Red }

Write-Host ""
Write-Host "💡 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Wait a few seconds for background save to Firestore" -ForegroundColor White
Write-Host "   2. Run this script again to see cached results" -ForegroundColor White
Write-Host "   3. Try different queries: 'ford mustang', 'honda civic', etc." -ForegroundColor White
Write-Host ""
