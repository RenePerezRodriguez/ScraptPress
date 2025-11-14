# 🧪 Testing Guide - ScraptPress

> Guía completa de testing para el sistema de scraping

---

## 📋 Scripts Disponibles

### 🎯 Scripts Principales

**`tests/test-api.ps1`**
- Testing completo de endpoints
- Validación de responses
- Testing de batching y prefetch

**`tests/test-api-interactive.ps1`**
- Testing interactivo con menú
- Queries personalizadas
- Debugging paso a paso

---

## 🚀 Testing Rápido

### PowerShell

```powershell
# Test básico
cd tests
.\test-api.ps1

# Test interactivo
.\test-api-interactive.ps1
```

### Variables de Entorno

Configurar en `.env`:

```env
API_KEYS=your-test-api-key-here
```

---

## 📊 Test Cases

### 1. Búsqueda Básica

**Objetivo**: Verificar búsqueda simple con cache

```powershell
$headers = @{
    "X-API-Key" = $env:API_KEY
    "Content-Type" = "application/json"
}

$body = @{
    query = "toyota"
    page = 1
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "http://localhost:3000/api/search/intelligent" `
    -Method POST `
    -Headers $headers `
    -Body $body

Write-Host "✅ Success: $($response.success)"
Write-Host "📦 Source: $($response.source)"
Write-Host "🚗 Returned: $($response.returned)"
Write-Host "📄 Batch: $($response.batch.number)"
```

**Expectativas**:
- `success`: true
- `returned`: 10
- `batch.size`: 100
- `batch.totalPagesInBatch`: 10

---

### 2. Testing de Batching

**Objetivo**: Verificar sistema de batching de 100 vehículos

```powershell
# Página 1 (batch 0)
$response1 = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" `
    -Method POST -Headers $headers -Body (@{query="toyota";page=1} | ConvertTo-Json)

Write-Host "Batch: $($response1.batch.number) (debe ser 0)"
Write-Host "Página en batch: $($response1.batch.currentPageInBatch) (debe ser 1)"

# Página 5 (batch 0, última del batch)
$response5 = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" `
    -Method POST -Headers $headers -Body (@{query="toyota";page=5} | ConvertTo-Json)

Write-Host "Batch: $($response5.batch.number) (debe ser 0)"
Write-Host "Página en batch: $($response5.batch.currentPageInBatch) (debe ser 5)"

# Página 11 (batch 1, primera del batch)
$response11 = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" `
    -Method POST -Headers $headers -Body (@{query="toyota";page=11} | ConvertTo-Json)

Write-Host "Batch: $($response11.batch.number) (debe ser 1)"
Write-Host "Página en batch: $($response11.batch.currentPageInBatch) (debe ser 1)"
```

**Expectativas**:
- Página 1-10 → Batch 0
- Página 11-20 → Batch 1
- Página 21-30 → Batch 2

---

### 3. Testing de Prefetch

**Objetivo**: Verificar trigger de prefetch automático

```powershell
# Página 3 (no debe recomendar prefetch)
$response3 = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" `
    -Method POST -Headers $headers -Body (@{query="toyota";page=3} | ConvertTo-Json)

Write-Host "Prefetch recomendado: $($response3.prefetch.recommended) (debe ser false)"

# Página 4 (debe recomendar prefetch)
$response4 = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" `
    -Method POST -Headers $headers -Body (@{query="toyota";page=4} | ConvertTo-Json)

Write-Host "Prefetch recomendado: $($response4.prefetch.recommended) (debe ser true)"
```

**Expectativas**:
- Páginas 1-3: `prefetch.recommended` = false
- Páginas 4+, 14+, 24+: `prefetch.recommended` = true

---

### 4. Testing de Cache

**Objetivo**: Verificar funcionamiento del cache

```powershell
# Primera request (scraping)
$start = Get-Date
$response1 = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" `
    -Method POST -Headers $headers -Body (@{query="bmw";page=1;force_fresh=$true} | ConvertTo-Json)
$duration1 = (Get-Date) - $start

Write-Host "Primera request (scraping): $($duration1.TotalSeconds)s"
Write-Host "Source: $($response1.source) (debe ser 'copart')"

# Segunda request (cache)
$start = Get-Date
$response2 = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" `
    -Method POST -Headers $headers -Body (@{query="bmw";page=1} | ConvertTo-Json)
$duration2 = (Get-Date) - $start

Write-Host "Segunda request (cache): $($duration2.TotalSeconds)s"
Write-Host "Source: $($response2.source) (debe ser 'firestore')"
```

**Expectativas**:
- Primera: `source` = "copart", ~4-5 min
- Segunda: `source` = "firestore", < 2s
- Cache hit debe ser 100x más rápido

---

### 5. Testing de Navegación

**Objetivo**: Verificar navegación entre páginas

```powershell
# Navegar por las primeras 10 páginas (mismo batch)
1..10 | ForEach-Object {
    $page = $_
    $start = Get-Date
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" `
        -Method POST -Headers $headers -Body (@{query="toyota";page=$page} | ConvertTo-Json)
    $duration = (Get-Date) - $start
    
    Write-Host "Página $page - Batch: $($response.batch.number) - Tiempo: $($duration.TotalMilliseconds)ms"
}
```

**Expectativas**:
- Todas las páginas 1-10 deben ser < 200ms (cache)
- Todas deben tener `batch.number` = 0

---

## 🔍 Validación de Datos

### Estructura de Vehículo

```powershell
$vehicle = $response.vehicles[0]

# Campos requeridos
@('lot_number', 'vin', 'make', 'model', 'year') | ForEach-Object {
    if (-not $vehicle.$_) {
        Write-Host "❌ Campo faltante: $_" -ForegroundColor Red
    }
}

# VIN completo (sin asteriscos)
if ($vehicle.vin -match '\*') {
    Write-Host "❌ VIN incompleto: $($vehicle.vin)" -ForegroundColor Red
}

# Imágenes
if ($vehicle.images_gallery.Count -lt 5) {
    Write-Host "⚠️ Pocas imágenes: $($vehicle.images_gallery.Count)" -ForegroundColor Yellow
}

Write-Host "✅ Validación completa" -ForegroundColor Green
```

---

## 🐛 Troubleshooting

### Error: 401 Unauthorized

```powershell
# Verificar API key en .env
$env:API_KEY

# Si está vacío, configurar
$env:API_KEY = "your-api-key-here"
```

### Error: 500 Internal Server Error

```bash
# Ver logs del servidor
npm run dev

# Verificar Redis
docker ps | grep redis

# Verificar Firestore
firebase firestore:indexes
```

### Scraping muy lento

```powershell
# Verificar rate limiter
# El sistema limita a 10 scrapes/minuto

# Esperar entre tests
Start-Sleep -Seconds 10
```

---

## 📊 Test Checklist

Antes de desplegar a producción:

- [ ] ✅ Búsqueda básica funciona
- [ ] ✅ Batching de 100 vehículos correcto
- [ ] ✅ Prefetch se activa en páginas 4+, 14+, 24+
- [ ] ✅ Cache funciona (Redis + Firestore)
- [ ] ✅ Navegación instantánea entre páginas del mismo batch
- [ ] ✅ VIN completo sin asteriscos
- [ ] ✅ 12+ imágenes por vehículo
- [ ] ✅ Rate limiter activo (10/min, 3 concurrentes)
- [ ] ✅ Health endpoint responde
- [ ] ✅ Errores manejados correctamente

---

## 📚 Recursos

- [API Reference](./API-REFERENCE.md)
- [Sistemas Defensivos](../SISTEMAS-DEFENSIVOS.md)
- [README Principal](../README.md)

---

**Última actualización**: 13 de noviembre de 2025
