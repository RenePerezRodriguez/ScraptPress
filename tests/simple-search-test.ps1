# Simple test script for search endpoints
# Run from: D:\Sitios Web\ScraptPress

Write-Host "`n🧪 Testing Search API`n" -ForegroundColor Cyan

$BASE_URL = "http://localhost:3000"
$API_KEY = $env:API_KEY

if (-not $API_KEY) {
    Write-Host "⚠️  API_KEY not found in environment variables" -ForegroundColor Yellow
    Write-Host "Using API key from .env file..." -ForegroundColor Gray
    $API_KEY = "0d2366db7108a67dcc49e309128808f566c092cb9afa8fc789b33b92ee0a863e"
}

$headers = @{
    "X-API-Key" = $API_KEY
    "Content-Type" = "application/json"
}

# Test 1: Fresh scrape
Write-Host "1. Testing fresh scrape..." -ForegroundColor Yellow
try {
    $body = '{"query":"tesla","count":5,"page":1}'
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/scraper/vehicles" -Method Post -Body $body -ContentType "application/json" -Headers $headers
    Write-Host "   ✅ Fresh scrape OK" -ForegroundColor Green
    Write-Host "   Returned: $($response.returned) vehicles" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "   ⏳ Waiting 5 seconds for background save to Firestore..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Test 2: Cached search
Write-Host "2. Testing cached search..." -ForegroundColor Yellow
try {
    $url = "$BASE_URL/api/search/cached" + "?" + "query=tesla" + "&" + "page=1" + "&" + "limit=5"
    Write-Host "   📡 Requesting: $url" -ForegroundColor Gray
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -TimeoutSec 10
    Write-Host "   ✅ Cached search OK" -ForegroundColor Green
    Write-Host "   Source: $($response.source)" -ForegroundColor Gray
    Write-Host "   Total in DB: $($response.total)" -ForegroundColor Gray
    Write-Host "   Returned: $($response.vehicles.Count) vehicles" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "✨ Tests complete!" -ForegroundColor Cyan
Write-Host ""
