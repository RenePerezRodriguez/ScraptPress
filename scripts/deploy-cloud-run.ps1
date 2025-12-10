#!/usr/bin/env pwsh
# Deploy API to Cloud Run

param(
    [string]$Project = "scraptpress",
    [string]$Region = "us-central1",
    [string]$ServiceName = "scraptpress",
    [string]$Version = "v3.1"
)

Write-Host "🚀 Deploying ScraptPress to Google Cloud Run" -ForegroundColor Cyan
Write-Host "Project: $Project" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow
Write-Host "Service: $ServiceName" -ForegroundColor Yellow
Write-Host "Version: $Version" -ForegroundColor Yellow
Write-Host ""

# Build TypeScript
Write-Host "📦 Building TypeScript..." -ForegroundColor Green
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completed" -ForegroundColor Green
Write-Host ""

# Deploy API Service
Write-Host "🌐 Deploying API service to Cloud Run..." -ForegroundColor Green
gcloud run deploy $ServiceName `
    --source . `
    --platform managed `
    --region $Region `
    --project $Project `
    --allow-unauthenticated `
    --min-instances 0 `
    --max-instances 10 `
    --memory 2Gi `
    --cpu 2 `
    --timeout 300 `
    --port 8080 `
    --set-env-vars "NODE_ENV=production,PORT=8080" `
    --tag $Version

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Service URL: https://$ServiceName-<hash>-uc.a.run.app" -ForegroundColor Cyan
Write-Host "📊 Console: https://console.cloud.google.com/run?project=$Project" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Yellow
Write-Host "  1. Configure custom domain: scrap.sumtrading.us" -ForegroundColor White
Write-Host "  2. Set environment variables in Cloud Run console:" -ForegroundColor White
Write-Host "     - API_KEY, ADMIN_TOKEN" -ForegroundColor White
Write-Host "     - FIREBASE_SERVICE_ACCOUNT_PATH" -ForegroundColor White
Write-Host "     - GEMINI_API_KEY" -ForegroundColor White
Write-Host "     - REDIS_URL (Redis Labs)" -ForegroundColor White
Write-Host "     - SENTRY_DSN" -ForegroundColor White
Write-Host "  3. Enable Cloud Run API if not enabled" -ForegroundColor White
Write-Host "  4. Verify health: curl https://scrap.sumtrading.us/api/health" -ForegroundColor White
