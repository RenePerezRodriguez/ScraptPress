# Test the Vehicle Search API endpoint
# Requires server running on localhost:3000

Write-Host "🔍 Testing /api/scraper/vehicles endpoint..." -ForegroundColor Cyan
Write-Host ""

# API Key for authentication (use the one from your .env file)
$API_KEY = "your-super-secret-api-key-here-change-me"
$headers = @{
  "Content-Type" = "application/json"
  "X-API-Key" = $API_KEY
}

# Example 1: Search for Tesla vehicles
Write-Host "1️⃣ Searching for TESLA vehicles..." -ForegroundColor Yellow
try {
  $response = Invoke-WebRequest -Uri "http://localhost:3000/api/scraper/vehicles" `
    -Method POST `
    -Headers $headers `
    -Body '{"query":"tesla","count":5}' `
    -UseBasicParsing

  $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Response: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

# Example 2: Search for Ford vehicles
Write-Host "2️⃣ Searching for FORD vehicles..." -ForegroundColor Yellow
try {
  $response = Invoke-WebRequest -Uri "http://localhost:3000/api/scraper/vehicles" `
    -Method POST `
    -Headers $headers `
    -Body '{"query":"ford","count":3}' `
    -UseBasicParsing

  $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

# Example 3: Custom search query
Write-Host "3️⃣ Searching for Honda Civic..." -ForegroundColor Yellow
try {
  $response = Invoke-WebRequest -Uri "http://localhost:3000/api/scraper/vehicles" `
    -Method POST `
    -Headers $headers `
    -Body '{"query":"honda civic","count":5}' `
    -UseBasicParsing

  $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

# Example 4: Test without API Key (should fail)
Write-Host "4️⃣ Testing without API Key (should return 401)..." -ForegroundColor Yellow
try {
  $response = Invoke-WebRequest -Uri "http://localhost:3000/api/scraper/vehicles" `
    -Method POST `
    -Headers @{"Content-Type" = "application/json"} `
    -Body '{"query":"test","count":1}' `
    -UseBasicParsing

  Write-Host "❌ Security issue: Request succeeded without API Key!" -ForegroundColor Red
} catch {
  if ($_.Exception.Response.StatusCode -eq 401) {
    Write-Host "✅ Correctly blocked unauthorized request" -ForegroundColor Green
  } else {
    Write-Host "⚠️ Unexpected status code: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "✅ Tests completed!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Remember to update the API_KEY variable in this script to match your .env file" -ForegroundColor Cyan
