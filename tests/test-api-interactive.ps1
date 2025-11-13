#!/usr/bin/env powershell
# Quick test of the API using PowerShell's Invoke-WebRequest

# Colors for output
$info = 'Cyan'
$success = 'Green'
$warning = 'Yellow'

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor $info
Write-Host "║       ScraptPress API Test - Vehicle Search                   ║" -ForegroundColor $info
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor $info
Write-Host ""

# Check if server is running
Write-Host "Checking if server is running on localhost:3000..." -ForegroundColor $warning

try {
    $test = Invoke-WebRequest -Uri "http://localhost:3000" -Method GET -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✅ Server is running!" -ForegroundColor $success
} catch {
    Write-Host "❌ Server is not running. Start it with: npm start" -ForegroundColor 'Red'
    exit 1
}

Write-Host ""
Write-Host "Test 1: Search for Tesla vehicles (5 results)" -ForegroundColor $warning
Write-Host "─" * 50 -ForegroundColor $info

try {
    $uri = "http://localhost:3000/api/vehicles"
    $body = @{
        query = "tesla"
        maxItems = 5
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri $uri `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body $body `
        -UseBasicParsing

    $data = $response.Content | ConvertFrom-Json

    Write-Host "✅ Request successful" -ForegroundColor $success
    Write-Host "   Query: $($data.query)" -ForegroundColor $info
    Write-Host "   Count: $($data.count)" -ForegroundColor $info
    Write-Host ""
    
    if ($data.vehicles -and $data.vehicles.Count -gt 0) {
        $data.vehicles | ForEach-Object {
            Write-Host "   • $($_.year) $($_.make) $($_.model)" -ForegroundColor $success
            Write-Host "     Lot: $($_.lot_number) | VIN: $($_.vin)" -ForegroundColor $info
            Write-Host "     Bid: $($_.current_bid) | Damage: $($_.primary_damage)" -ForegroundColor $info
            Write-Host "     Link: $($_.copart_url)" -ForegroundColor 'Blue'
            Write-Host ""
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor 'Red'
}

Write-Host ""
Write-Host "Test 2: Search for Ford vehicles (3 results)" -ForegroundColor $warning
Write-Host "─" * 50 -ForegroundColor $info

try {
    $uri = "http://localhost:3000/api/vehicles"
    $body = @{
        query = "ford"
        maxItems = 3
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri $uri `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body $body `
        -UseBasicParsing

    $data = $response.Content | ConvertFrom-Json

    Write-Host "✅ Request successful" -ForegroundColor $success
    Write-Host "   Query: $($data.query)" -ForegroundColor $info
    Write-Host "   Count: $($data.count)" -ForegroundColor $info
    Write-Host ""
    
    if ($data.vehicles -and $data.vehicles.Count -gt 0) {
        $data.vehicles | ForEach-Object {
            Write-Host "   • $($_.year) $($_.make) $($_.model)" -ForegroundColor $success
            Write-Host "     Lot: $($_.lot_number) | VIN: $($_.vin)" -ForegroundColor $info
            Write-Host "     Odometer: $($_.odometer) | Location: $($_.location)" -ForegroundColor $info
            Write-Host ""
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor 'Red'
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor $info
Write-Host "║ All tests completed! Check API_DOCUMENTATION.md for more info ║" -ForegroundColor $info
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor $info
