# Performance test for cached search
# Tests multiple searches to measure average response time

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
    Write-Host "[ERROR] API_KEY not found in .env file" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Content-Type" = "application/json"
    "X-API-Key" = $apiKey
}

Write-Host "`nCache Performance Test" -ForegroundColor Cyan
Write-Host "=" * 50

# Test queries
$queries = @("tesla", "ford", "toyota", "bmw", "mercedes")
$times = @()

foreach ($query in $queries) {
    Write-Host "`nTesting: $query" -ForegroundColor Yellow
    
    $url = "$baseUrl/api/search/cached?query=$query&page=1&limit=5"
    
    try {
        $startTime = Get-Date
        $response = Invoke-RestMethod -Uri $url -Method GET -Headers $headers -TimeoutSec 10
        $endTime = Get-Date
        $duration = ($endTime - $startTime).TotalMilliseconds
        
        $times += $duration
        
        Write-Host "  [OK] Response time: $([math]::Round($duration))ms" -ForegroundColor Green
        Write-Host "  Found: $($response.total) vehicles" -ForegroundColor Gray
        
    } catch {
        Write-Host "  [ERROR] $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 500
}

# Calculate statistics
if ($times.Count -gt 0) {
    $avgTime = ($times | Measure-Object -Average).Average
    $minTime = ($times | Measure-Object -Minimum).Minimum
    $maxTime = ($times | Measure-Object -Maximum).Maximum
    
    Write-Host "`n" + ("=" * 50) -ForegroundColor Cyan
    Write-Host "Performance Summary:" -ForegroundColor Cyan
    Write-Host "  Average: $([math]::Round($avgTime))ms" -ForegroundColor $(if ($avgTime -lt 500) { "Green" } elseif ($avgTime -lt 1000) { "Yellow" } else { "Red" })
    Write-Host "  Min: $([math]::Round($minTime))ms" -ForegroundColor Green
    Write-Host "  Max: $([math]::Round($maxTime))ms" -ForegroundColor Red
    Write-Host "  Tests: $($times.Count)" -ForegroundColor Gray
    
    if ($avgTime -lt 500) {
        Write-Host "`n Target achieved! (< 500ms)" -ForegroundColor Green
    } elseif ($avgTime -lt 1000) {
        Write-Host "`n Good performance (< 1s)" -ForegroundColor Yellow
    } else {
        Write-Host "`n Performance needs improvement (> 1s)" -ForegroundColor Red
    }
}
