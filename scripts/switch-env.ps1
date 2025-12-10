# Script para cambiar entre LOCAL y PRODUCCIÓN
# Uso: .\switch-env.ps1 local  o  .\switch-env.ps1 prod
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("local", "prod")]
    [string]$env
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentDir = Split-Path -Parent $scriptDir
$frontendEnv = Join-Path $parentDir "SUM-Trading-repo\.env.local"

if ($env -eq "local") {
    Write-Host "Cambiando a LOCAL..." -ForegroundColor Cyan
    
    # Frontend apunta a localhost:3000
    (Get-Content $frontendEnv) -replace 'SCRAPTPRESS_API_URL=https://scrap.sumtrading.us', 'SCRAPTPRESS_API_URL=http://localhost:3000' | Set-Content $frontendEnv
    
    Write-Host "Frontend configurado para http://localhost:3000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ejecuta estos comandos:" -ForegroundColor Yellow
    Write-Host "Terminal 1 (Backend): cd 'D:\Sitios Web\ScraptPress' ; npm run dev"
    Write-Host "Terminal 2 (Frontend): cd 'D:\Sitios Web\SUM-Trading-repo' ; npm run dev"
    
} elseif ($env -eq "prod") {
    Write-Host "Cambiando a PRODUCCION..." -ForegroundColor Cyan
    
    # Frontend apunta a Cloud Run
    (Get-Content $frontendEnv) -replace 'SCRAPTPRESS_API_URL=http://localhost:3000', 'SCRAPTPRESS_API_URL=https://scrap.sumtrading.us' | Set-Content $frontendEnv
    
    Write-Host "Frontend configurado para https://scrap.sumtrading.us" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ejecuta:" -ForegroundColor Yellow
    Write-Host "Terminal (Frontend): cd 'D:\Sitios Web\SUM-Trading-repo' ; npm run dev"
}

Write-Host ""
Write-Host "Configuracion actualizada" -ForegroundColor Magenta
