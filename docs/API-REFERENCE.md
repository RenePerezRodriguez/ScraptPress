# 📡 API Reference - ScraptPress

> Documentación completa de endpoints y sistema de batching inteligente

---

## 🎯 Estrategia de Batching

### Concepto Clave

```
Frontend: 10 vehículos por página
Backend:  100 vehículos por batch (1 página Copart Vista Clásica)
Resultado: 1 scraping = 10 páginas frontend disponibles

┌────────────────────────────────────────────────┐
│ Batch 0 (100 veh) → Páginas 1, 2, 3...10      │
│ Batch 1 (100 veh) → Páginas 11, 12, 13...20   │
│ Batch 2 (100 veh) → Páginas 21, 22, 23...30   │
└────────────────────────────────────────────────┘
```

### Flujo de Prefetch con Sistema de Locks

```
Usuario en página 1-2:
  ✅ Batch 0 en cache (páginas 1-10 disponibles)
  ⏸️  No prefetch necesario

Usuario llega a página 3:
  ✅ Retorna página 3 desde cache
  🔐 Backend adquiere lock para batch 1
  🚀 PREFETCH Batch 1 inicia en background (3-5 min)

Usuario navega a página 11 (mientras prefetch trabaja):
  🔒 Backend detecta lock activo
  ⏳ Espera hasta que prefetch termine (max 6 min)
  🔓 Lock liberado, batch disponible
  ✅ Cache HIT (desde Firestore)
  ⚡ Navegación instantánea después de espera

Usuario navega a página 11 (prefetch ya terminó):
  ✅ Cache HIT directo
  ⚡ Navegación instantánea (~200ms)
```

---

## 📡 Endpoints

### 1. POST /api/search/intelligent

**Búsqueda inteligente con batching y prefetch automático**

Endpoint principal optimizado que implementa el sistema de batching de 100 vehículos.

#### Request

```http
POST /api/search/intelligent HTTP/1.1
Host: localhost:3000
X-API-Key: YOUR_API_KEY
Content-Type: application/json

{
  "query": "toyota",
  "page": 1
}
```

#### Parámetros

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `query` | string | **requerido** | Término de búsqueda (marca, modelo, año) |
| `page` | number | 1 | Número de página frontend (1, 2, 3...) |
| `force_fresh` | boolean | false | Forzar scraping nuevo (ignorar cache) |
| `max_age_hours` | number | 24 | Edad máxima del cache en horas |

#### Response 200 OK

```json
{
  "success": true,
  "source": "firestore",
  "cached": true,
  "fresh": false,
  "query": "toyota",
  "page": 1,
  "limit": 10,
  "returned": 10,
  "batch": {
    "number": 0,
    "size": 100,
    "offsetInBatch": 0,
    "totalInBatch": 100,
    "totalPagesInBatch": 10,
    "hasMoreInBatch": true,
    "currentPageInBatch": 1
  },
  "prefetch": {
    "recommended": false,
    "message": "No prefetch needed yet (page 1 of 10 in batch)"
  },
  "vehicles": [
    {
      "lot_number": "89659405",
      "vin": "4T1K31AK2PU123456",
      "year": "2023",
      "make": "TOYOTA",
      "model": "CAMRY",
      "trim": "SE",
      "odometer": "75786 mi",
      "engine": "2.5L 4 Cyl",
      "transmission": "Automatic",
      "exterior_color": "WHITE",
      "primary_damage": "NORMAL WEAR",
      "current_bid": "$9900",
      "location": "CA - VAN NUYS",
      "auction_date": "2025-11-13T17:00:00.000Z",
      "images_gallery": [
        {
          "thumbnail": "https://cs.copart.com/.../thb.jpg",
          "full": "https://cs.copart.com/.../ful.jpg",
          "high_res": "https://cs.copart.com/.../hrs.jpg"
        }
      ],
      "engine_video": "https://cs.copart.com/.../video.mp4",
      "highlights": ["Runs and Drives", "Clean Interior"],
      "copart_url": "https://www.copart.com/lot/89659405"
    }
  ],
  "scrapeDurationSeconds": 0,
  "timestamp": "2025-11-13T..."
}
```

#### Response Fields

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `success` | boolean | Indica si la operación fue exitosa |
| `source` | string | `"firestore"` (cache), `"firestore-after-wait"` (esperó lock), `"copart"` (scraping nuevo) |
| `cached` | boolean | `true` si viene del cache |
| `fresh` | boolean | `true` si fue scrapeado recientemente |
| `query` | string | Término de búsqueda usado |
| `page` | number | Número de página frontend actual |
| `limit` | number | Vehículos por página (siempre 10) |
| `returned` | number | Vehículos retornados en esta respuesta |
| `batch.number` | number | Número de batch (0, 1, 2...) |
| `batch.size` | number | Tamaño del batch (100) |
| `batch.currentPageInBatch` | number | Página actual dentro del batch (1-10) |
| `batch.totalPagesInBatch` | number | Total de páginas en el batch (10) |
| `batch.hasMoreInBatch` | boolean | Hay más páginas en este batch |
| `prefetch.recommended` | boolean | Si debería hacer prefetch |
| `prefetch.message` | string | Mensaje informativo sobre prefetch |
| `vehicles` | array | Array de vehículos |
| `scrapeDurationSeconds` | number | Tiempo de scraping (si aplica) |

#### Ejemplos de Uso

**JavaScript/TypeScript**

```typescript
async function searchVehicles(query: string, page: number = 1) {
  const response = await fetch('http://localhost:3000/api/search/intelligent', {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, page })
  });
  
  const data = await response.json();
  
  // Prefetch automático si recomendado
  if (data.prefetch?.recommended) {
    // No esperar respuesta, background
    fetch('http://localhost:3000/api/search/intelligent', {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        query, 
        page: page + 10  // Siguiente batch
      })
    }).catch(console.warn);
  }
  
  return data;
}

// Uso
const results = await searchVehicles('toyota', 1);
console.log(`Página ${results.page} - Batch ${results.batch.number}`);
console.log(`${results.returned} vehículos retornados`);
```

**React Hook**

```typescript
import { useState, useEffect } from 'react';

function useVehicleSearch(query: string, page: number) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    const search = async () => {
      setLoading(true);
      
      const response = await fetch('/api/search/intelligent', {
        method: 'POST',
        headers: {
          'X-API-Key': process.env.NEXT_PUBLIC_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, page })
      });
      
      const result = await response.json();
      setData(result);
      setLoading(false);
      
      // Prefetch automático
      if (result.prefetch?.recommended) {
        fetch('/api/search/intelligent', {
          method: 'POST',
          headers: {
            'X-API-Key': process.env.NEXT_PUBLIC_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query, page: page + 10 })
        });
      }
    };
    
    search();
  }, [query, page]);
  
  return { data, loading };
}
```

**PowerShell**

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

Write-Host "Página $($response.page) - Batch $($response.batch.number)"
Write-Host "Retornados: $($response.returned) vehículos"

# Prefetch si recomendado
if ($response.prefetch.recommended) {
    $prefetchBody = @{
        query = "toyota"
        page = $response.page + 10
    } | ConvertTo-Json
    
    Start-Job -ScriptBlock {
        param($url, $headers, $body)
        Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body
    } -ArgumentList "http://localhost:3000/api/search/intelligent", $headers, $prefetchBody
}
```

---

### 2. GET /api/health

**Health check del sistema**

#### Request

```http
GET /api/health HTTP/1.1
Host: localhost:3000
```

#### Response 200 OK

```json
{
  "status": "healthy",
  "timestamp": "2025-11-13T10:30:00.000Z",
  "uptime": 3600,
  "services": {
    "redis": "connected",
    "firestore": "connected"
  }
}
```

---

### 3. GET /api/search/stats (Deprecated)

**Estadísticas de búsqueda**

⚠️ Este endpoint está deprecado. Use `/api/search/intelligent` directamente.

---

## 🔐 Autenticación

### API Key Header

Todos los endpoints (excepto `/health`) requieren autenticación:

```http
X-API-Key: YOUR_API_KEY_HERE
```

### Generar API Key

```bash
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Agregar al `.env`:

```env
API_KEYS=key1,key2,key3
```

---

## 📊 Códigos de Respuesta

| Código | Descripción |
|--------|-------------|
| `200` | Éxito |
| `400` | Request inválido (parámetros faltantes o incorrectos) |
| `401` | No autorizado (API key inválido) |
| `404` | Endpoint no encontrado |
| `410` | Endpoint deprecado (usar alternativa sugerida) |
| `429` | Rate limit excedido |
| `500` | Error interno del servidor |

---

## ⚡ Optimizaciones

### Cache Multi-Nivel

```
Request → Redis (L1, < 100ms)
            ↓ miss
         Firestore (L2, < 2s)
            ↓ miss
         Check Lock Status
            │
            ├── Lock activo? → Esperar (30s-4min) → Firestore
            │
            └── No lock → Adquirir lock → Copart Scraping (L3, ~4-5 min)
                                           ↓
                                    Guardar en Firestore
                                           ↓
                                     Liberar lock
```

### Prefetch Inteligente

El sistema recomienda prefetch cuando:

```typescript
const pageWithinBatch = page % 10 || 10;  // 1-10
const shouldPrefetch = pageWithinBatch >= 4;  // Páginas 4+, 14+, 24+
```

**Ejemplo**:
- Página 1-3: No prefetch
- Página 4: ✅ Prefetch batch 1
- Página 11-13: No prefetch  
- Página 14: ✅ Prefetch batch 2

---

## 🧪 Testing

### Curl Examples

```bash
# Búsqueda básica
curl -X POST http://localhost:3000/api/search/intelligent \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"toyota","page":1}'

# Forzar scraping fresco
curl -X POST http://localhost:3000/api/search/intelligent \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"toyota","page":1,"force_fresh":true}'

# Página específica
curl -X POST http://localhost:3000/api/search/intelligent \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"toyota","page":5}'
```

### PowerShell Test Script

```powershell
# tests/test-api.ps1
$headers = @{
    "X-API-Key" = $env:API_KEY
    "Content-Type" = "application/json"
}

# Test página 1
Write-Host "Testing página 1..." -ForegroundColor Cyan
$body1 = @{ query = "toyota"; page = 1 } | ConvertTo-Json
$result1 = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" -Method POST -Headers $headers -Body $body1
Write-Host "✅ Batch: $($result1.batch.number), Retornados: $($result1.returned)"

# Test página 4 (debería recomendar prefetch)
Write-Host "`nTesting página 4..." -ForegroundColor Cyan
$body4 = @{ query = "toyota"; page = 4 } | ConvertTo-Json
$result4 = Invoke-RestMethod -Uri "http://localhost:3000/api/search/intelligent" -Method POST -Headers $headers -Body $body4
Write-Host "✅ Prefetch recomendado: $($result4.prefetch.recommended)"
```

---

## 📚 Ver También

- [Sistemas Defensivos](../SISTEMAS-DEFENSIVOS.md) - Rate limiting, proxies, queue
- [Arquitectura](./ARCHITECTURE.md) - Diseño del sistema
- [Testing Guide](./TESTING.md) - Guía completa de testing

---

**Última actualización**: 14 de noviembre de 2025  
**Versión**: 2.1.0  
**Nuevas características**: Sistema de Locks anti-duplicación
