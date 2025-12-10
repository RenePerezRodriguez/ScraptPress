# 📡 API Reference - ScraptPress v3.2

> Documentación completa de endpoints con Smart API Interception y Caché Híbrido

---

## 🎯 Arquitectura de Endpoints

### Flujo de Datos

```
Cliente → API Gateway → Redis L1 Cache (30ms)
                          ↓ miss
                        Firestore L2 Cache (500ms)
                          ↓ miss
                        Live Scraping (18s)
                          ↓
                        Sync to copart_vehicles
                          ↓
                        Populate Cache
```

---

## 📡 Endpoints Principales

### 1. GET /api/search/vehicles

**Búsqueda inteligente con caché híbrido y paginación**

#### Request

```http
GET /api/search/vehicles?query=toyota&page=1&limit=10 HTTP/1.1
Host: localhost:3000
X-API-Key: YOUR_API_KEY
```

#### Parámetros

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `query` | string | **requerido** | Término de búsqueda (marca, modelo, año) |
| `page` | number | 1 | Número de página (1, 2, 3...) |
| `limit` | number | 10 | Resultados por página (max: 100) |
| `async` | boolean | false | Modo asíncrono (retorna batchId inmediato) |

#### Response 200 OK (Sync Mode)

```json
{
  "success": true,
  "source": "redis",
  "cached": true,
  "query": "toyota",
  "page": 1,
  "limit": 10,
  "returned": 10,
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
      "auction_date": "2025-12-10T17:00:00Z",
      "images_gallery": [
        {
          "thumbnail": "https://cs.copart.com/.../thb.jpg",
          "full": "https://cs.copart.com/.../ful.jpg",
          "high_res": "https://cs.copart.com/.../hrs.jpg"
        }
      ],
      "engine_video": "https://cs.copart.com/.../video.mp4",
      "highlights": ["Runs and Drives"],
      "copart_url": "https://www.copart.com/lot/89659405"
    }
  ],
  "scrapeDurationSeconds": 0,
  "timestamp": "2025-12-10T11:26:00Z"
}
```

#### Response 200 OK (Async Mode)

```json
{
  "success": true,
  "source": "queued",
  "batchId": "job-abc-123",
  "status": "queued"
}
```

#### Ejemplos de Uso

**cURL**

```bash
# Búsqueda síncrona
curl "http://localhost:3000/api/search/vehicles?query=toyota&page=1&limit=10" \
  -H "X-API-Key: YOUR_KEY"

# Búsqueda asíncrona
curl "http://localhost:3000/api/search/vehicles?query=toyota&async=true" \
  -H "X-API-Key: YOUR_KEY"
```

**JavaScript/TypeScript**

```typescript
async function searchVehicles(query: string, page = 1, limit = 10) {
  const response = await fetch(
    `/api/search/vehicles?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
    {
      headers: { 'X-API-Key': process.env.API_KEY }
    }
  );
  return response.json();
}

// Uso
const results = await searchVehicles('toyota', 1, 10);
console.log(`${results.returned} vehículos encontrados (${results.source})`);
```

**PowerShell**

```powershell
$headers = @{ "X-API-Key" = $env:API_KEY }
$response = Invoke-RestMethod `
    -Uri "http://localhost:3000/api/search/vehicles?query=toyota&page=1&limit=10" `
    -Headers $headers

Write-Host "Retornados: $($response.returned) vehículos desde $($response.source)"
```

---

### 2. GET /api/search/status/:batchId

**Consultar estado de búsqueda asíncrona**

#### Request

```http
GET /api/search/status/job-abc-123 HTTP/1.1
Host: localhost:3000
X-API-Key: YOUR_API_KEY
```

#### Response 200 OK (Completed)

```json
{
  "status": "completed",
  "vehiclesFound": 10,
  "vehicles": [...],
  "completedAt": "2025-12-10T11:27:00Z"
}
```

---

### 3. GET /api/vehicle/:lotNumber

**Obtener detalles de un vehículo específico**

#### Request

```http
GET /api/vehicle/89659405 HTTP/1.1
Host: localhost:3000
X-API-Key: YOUR_API_KEY
```

---

### 4. GET /api/health

**Health check del sistema**

#### Response 200 OK

```json
{
  "status": "healthy",
  "timestamp": "2025-12-10T11:26:00Z",
  "uptime": 3600,
  "services": {
    "redis": "connected",
    "firestore": "connected"
  }
}
```

---

## 🔐 Autenticación

Todos los endpoints (excepto `/health`) requieren:

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
API_KEY=your-generated-key-here
```

---

## 📊 Códigos de Respuesta

| Código | Descripción |
|--------|-------------|
| `200` | Éxito |
| `400` | Request inválido |
| `401` | No autorizado (API key inválido) |
| `404` | Endpoint o recurso no encontrado |
| `429` | Rate limit excedido |
| `500` | Error interno del servidor |
| `503` | Servicio no disponible (health check fallido) |

---

## ⚡ Cache Strategy

### Niveles de Cache

1. **L1 Redis** (30ms):
   - TTL: 1 hora
   - Keys: `search:query:page:limit`
   
2. **L2 Firestore** (500ms):
   - TTL: 7 días
   - Collection: `searches/{query}/cache/{page}-{limit}`

3. **Live Scraping** (18s):
   - Direct API interception
   - Auto-sync a `copart_vehicles`

---

## 🧪 Testing

### Script de Verificación

```bash
# Ejecutar el script completo de simulación
npx ts-node scripts/verify-prod-simulation.ts
```

---

**Última actualización**: 10 de diciembre de 2025  
**Versión**: 3.2.0  
**Nuevas características**: Smart API Interception, Caché Híbrido
