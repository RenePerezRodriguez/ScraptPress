# 🚗 ScraptPress - Copart Vehicle Scraper API

**API REST profesional de scraping de vehículos de Copart.com** con sistema de caché inteligente, paginación optimizada, extracción paralela de datos y Firebase Firestore.

## ✨ Características Principales

- 🔍 **Scraping Inteligente Híbrido** - Cache first con fallback a scraping en tiempo real
- 🚀 **Batching Optimizado** - Scraping por lotes de 50 vehículos para máxima eficiencia
- 🎯 **Prefetch Inteligente** - Carga anticipada de páginas siguientes en background
- ⚡ **Scraping Paralelo** - Procesa 3 vehículos simultáneamente (3-5x más rápido)
- 🤖 **Anti-Detección Avanzada** - Bypass completo de Incapsula/WAF de Copart
- 🔥 **Firebase Firestore** - Base de datos NoSQL en la nube con índices compuestos optimizados
- 📄 **Paginación Inteligente** - 10 items por página frontend, batches de 50 en backend
- 🔑 **Extracción Completa de VIN** - 100% de vehículos con VIN completo (sin asteriscos)
- 📸 **Galería Completa** - 12+ imágenes en 3 resoluciones (thumbnail, full, high-res) para TODOS los vehículos
- 🎬 **Videos de Motor** - Extracción automática de videos cuando están disponibles
- 🎯 **Datos Extendidos** - Highlights, especificaciones técnicas, historial de daños
- 🌐 **API REST** - Endpoints limpios con validación Zod
- 🔐 **Seguridad Enterprise** - API Keys, Helmet, CORS, rate limiting
- 📊 **Monitoreo Completo** - Sentry error tracking, métricas en tiempo real
- ☁️ **Cloud Ready** - Optimizado para Cloud Run con headless mode

## ⚡ Rendimiento

| Operación | Tiempo | Descripción |
|-----------|--------|-------------|
| **Cache Hit (Redis)** | < 100ms | Instantáneo |
| **Cache Hit (Firestore)** | < 2s | Muy rápido |
| **Scraping 100 vehículos** | ~4-5 min | Un batch completo |
| **Navegación (cached)** | < 100ms | Entre páginas del mismo batch |
| **Prefetch** | Background | No bloquea UI |
| **Espera de Lock** | 30s-4min | Si otro proceso está scrapeando el mismo batch |

### Optimizaciones v2.1

- ✅ **Batching 100 vehículos** - Vista Clásica Copart (1 página = 100 resultados)
- ✅ **Navegación Inteligente de Páginas** - 3 estrategias de fallback para máxima confiabilidad
  - Estrategia 1: Click directo en número de página (más rápido)
  - Estrategia 2: Click en botón "Siguiente" (páginas lejanas)
  - Estrategia 3: URL directa (fallback de emergencia)
- ✅ **Prefetch Inteligente** - Trigger en páginas 3+, 13+, 23+ (configurable)
- ✅ **Scraping Paralelo** - 3 vehículos con páginas dedicadas (seguro, probado)
- ✅ **Sistema de Locks** - Evita scraping duplicado con locks en memoria + espera inteligente
- ✅ **Rate Limiting** - 10/min, 3 concurrentes, protección anti-ban
- ✅ **Cache Multi-Nivel** - Redis + Firestore con TTL configurables
- ✅ **Timeouts Optimizados** - 500ms vs 2000ms (8x más rápido)
- ✅ **API Interceptors** - Captura de imágenes desde API interna de Copart

## 🏗️ Arquitectura del Sistema

### Stack Tecnológico

- **Backend**: Node.js 20+ con TypeScript 5.9
- **Framework**: Express 4.21 con async/await handlers
- **Scraping**: Playwright 1.56 (Chromium headless) con anti-detección
- **Base de Datos**: Firebase Firestore con índices compuestos
- **Cache**: Redis 7 (Docker) + Firestore como caché principal
- **Monitoreo**: Sentry para error tracking
- **Seguridad**: Helmet, CORS, Zod, API key authentication
- **Testing**: Jest con 54 tests (100% passing)

### Flujo de Datos Híbrido con Sistema de Locks

```
Usuario → API Request → Búsqueda en Firestore Cache
                              ↓
                        ¿Datos recientes?
                      /                  \
                   SÍ                    NO
                    ↓                     ↓
            Retornar Cache      ¿Lock activo para este batch?
              (< 2s)              /                      \
                               SÍ                        NO
                                ↓                         ↓
                     Esperar lock (max 6 min)    Adquirir lock
                     ↓ (lock liberado)              ↓
                  Buscar en cache           Scraping Copart
                     ↓                      (paralelización)
                Retornar datos                  ↓
                 (instantáneo)         Guardar en Firestore
                                              ↓
                                       Liberar lock
                                              ↓
                                       Retornar Datos
```

### Estructura de Datos (Firestore)

```
📁 studio-6719476275-3891a (Firebase Project)
  └── 📂 copart_vehicles           ← Colección principal
      ├── lot_number (doc ID)      ← Identificador único
      ├── search_tokens []          ← Array para búsquedas (índice compuesto)
      ├── updated_at               ← Timestamp (índice con search_tokens)
      └── datos del vehículo...    ← VIN, imágenes, highlights, etc.
      
Índice Compuesto Firestore (CRÍTICO):
  (search_tokens Array, updated_at Descending)
  → Performance: < 2s vs 10+ minutos sin índice
```

### Tokens de Búsqueda

```typescript
// "2020 MCLAREN AUTOMOTIVE 720S" genera:
search_tokens: [
  "mclaren automotive", "720s", "2020",
  "2020 mclaren automotive", "mclaren automotive 720s",
  "mclaren", "automotive"  // Palabras individuales
]
// Permite: query="mclaren" → encuentra "MCLAREN AUTOMOTIVE"
```

## 🎯 Endpoints Principales

### POST /api/search/intelligent

**Búsqueda inteligente con batching de 100 vehículos**

```bash
curl -X POST http://localhost:3000/api/search/intelligent \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"toyota","page":1}'
```

**Respuesta**:
```json
{
  "success": true,
  "source": "firestore",
  "cached": true,
  "page": 1,
  "limit": 10,
  "returned": 10,
  "batch": {
    "number": 0,
    "size": 100,
    "currentPageInBatch": 1,
    "totalPagesInBatch": 10
  },
  "prefetch": { "recommended": false },
  "vehicles": [...]
}
```

### GET /api/health

```bash
curl http://localhost:3000/api/health
```

Ver [documentación completa de API](docs/API-REFERENCE.md) para todos los endpoints.

## 🚀 Inicio Rápido

### Prerequisitos

- Node.js 20+ 
- Docker Desktop (para Redis)
- Cuenta de Firebase (para Firestore)
- Cuenta de Sentry (para monitoreo)

### Configuración Local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales:
# - API_KEY y ADMIN_TOKEN (generar con crypto)
# - SENTRY_DSN (desde tu proyecto Sentry)
# - FIREBASE_SERVICE_ACCOUNT_PATH (ruta al JSON de Firebase)

# 3. Iniciar Redis con Docker
docker compose -f docker-compose.redis.yml up -d

# 4. Ejecutar en desarrollo
npm run dev

# El servidor estará en http://localhost:3000
```

### Configuración de Firebase

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com/)
2. Habilitar Firestore Database
3. Ir a Project Settings → Service Accounts
4. Generar nueva clave privada (JSON)
5. Guardar en la raíz del proyecto
6. Actualizar `FIREBASE_SERVICE_ACCOUNT_PATH` en `.env`

### Deployment de Índices de Firestore

```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Desplegar índices (optimización de queries)
firebase deploy --only firestore:indexes
```

Ver [documentación de índices](docs/setup/FIRESTORE-INDEXES.md) para más detalles.

### Producción en Cloud Run

```bash
# Con CI/CD configurado (automático al push)
git push origin main

# O desplegar manualmente
gcloud run deploy scraptpress \
  --source . \
  --region=southamerica-east1 \
  --no-allow-unauthenticated
```

### Probar la API

```bash
# Búsqueda básica (caché si disponible)
curl "http://localhost:3000/api/search/hybrid?query=toyota&limit=5&page=1" \
  -H "X-API-Key: your-api-key-here"

# Forzar scraping fresco
curl "http://localhost:3000/api/search/hybrid?query=toyota&limit=5&force_fresh=true" \
  -H "X-API-Key: your-api-key-here"

# Segunda página
curl "http://localhost:3000/api/search/hybrid?query=toyota&limit=5&page=2" \
  -H "X-API-Key: your-api-key-here"

# PowerShell
$headers = @{"X-API-Key"="your-api-key-here"}
Invoke-RestMethod -Uri "http://localhost:3000/api/search/hybrid?query=toyota&limit=5" -Headers $headers
```

## 📦 Estructura del Proyecto

```
ScraptPress/
├── src/                    # Código fuente TypeScript
│   ├── index.ts           # Servidor Express
   ├── services/          # Lógica de scraping
   │   ├── scrapers/     # Platform scrapers (Copart)
   │   ├── repositories/ # Firestore repositories
   │   ├── cache.service.ts
   │   ├── scraping-lock.service.ts  # 🆕 Sistema de locks anti-duplicación
   │   ├── background-scraper.service.ts
   │   └── monitoring.service.ts
│   ├── api/               # Controllers, routes y middleware
│   │   ├── controllers/  # Business logic
│   │   ├── routes/       # API endpoints
│   │   ├── middleware/   # Auth, rate limiting, validation
│   │   └── utils/        # Helpers
│   ├── config/            # Configuración
│   │   ├── firebase.ts   # 🔥 Firestore connection
│   │   ├── sentry.ts     # 📊 Error tracking
│   │   ├── logger.ts     # Logging system
│   │   └── database.ts   # (deprecated - usando Firestore)
│   └── types/             # TypeScript interfaces
├── public/                # Frontend (HTML, CSS, JS)
├── docs/                  # 📚 Documentación
│   ├── setup/
│   │   └── FIRESTORE-INDEXES.md
│   ├── deployment/
│   │   └── CI-CD-SETUP.md
│   ├── architecture/
│   │   └── ADD_NEW_PLATFORM.md
│   └── api/
│       └── ejemplo-respuesta-optimizada.json
├── tests/                 # Tests con Jest
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
├── .github/
│   └── workflows/
│       └── ci-cd.yml     # Pipeline de CI/CD
├── firestore.indexes.json # Configuración de índices Firestore
├── docker-compose.redis.yml # Redis container config
├── dist/                  # Build compilado
└── package.json
```

## 📖 Documentación

### 📚 Guías Principales

- **[Documentación Completa](docs/README.md)** - Punto de entrada a toda la documentación
- **[API Reference](docs/API-REFERENCE.md)** - Referencia completa de endpoints
- **[Sistemas Defensivos](SISTEMAS-DEFENSIVOS.md)** ⭐ Rate Limiter, Proxy Rotator, Queue System
- **[Configuración Firebase](docs/setup/FIRESTORE-INDEXES.md)** - Índices y configuración

### 🚀 Inicio Rápido

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.redis.yml up -d
firebase deploy --only firestore:indexes
npm run dev
```

## 🎯 Características Técnicas Clave

### 1. Scraping Paralelo (Optimización A+C)

**Problema inicial**: Scraping secuencial ~60s por vehículo = 20 min para 20 vehículos

**Solución implementada**:

```typescript
// Procesar 3 vehículos simultáneamente
const PARALLEL_LIMIT = 3;
for (let i = 0; i < vehicles.length; i += PARALLEL_LIMIT) {
  const chunk = vehicles.slice(i, i + PARALLEL_LIMIT);
  
  await Promise.all(
    chunk.map(async (vehicle) => {
      // Cada vehículo tiene su propia página dedicada
      const dedicatedPage = await this.context.newPage();
      
      // Setup interceptor para capturar imágenes del API de Copart
      await this.setupApiInterceptor(dedicatedPage);
      
      await dedicatedPage.goto(lotUrl, { 
        waitUntil: 'domcontentloaded',  // Optimización C
        timeout: 15000 
      });
      
      await dedicatedPage.waitForTimeout(500);  // Optimización C (era 2000ms)
      
      // Extraer VIN, imágenes, highlights
      await extractAllData(dedicatedPage, vehicle);
      
      await dedicatedPage.close();
    })
  );
}
```

**Resultados**:
- ✅ **2 vehículos**: 121s (~60s/vehículo)
- ✅ **6 vehículos**: 156s (~26s/vehículo) - **Mejora de 57%**
- ✅ **20 vehículos estimado**: ~8-10 minutos (vs 20 minutos secuencial)

### 2. Interceptores de API por Página

**Problema**: Las imágenes vienen del API interno de Copart, no del DOM.

**Solución**:

```typescript
// Interceptar TODAS las respuestas JSON en páginas dedicadas
await dedicatedPage.on('response', async (response) => {
  const url = response.url();
  
  // Capturar imágenes del endpoint solr
  if (url.includes('/lotdetails/solr/lot-images')) {
    const json = await response.json();
    if (json.data?.imagesList?.IMAGE) {
      // Guardar imágenes en vehicleApiData Map
      const images = json.data.imagesList.IMAGE;
      existingData.solrImages = images; // 12+ imágenes
    }
  }
});
```

**Resultado**: ✅ 12 imágenes por vehículo (thumbnail, full, high-res)

### 3. Anti-Detección de Bots (Bypass Incapsula)

**Problema resuelto**: Copart usa Incapsula WAF que detecta y bloquea scrapers en modo headless.

**Solución implementada**:

```typescript
// 1. Anti-detección en contexto del navegador
await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
  viewport: { width: 1920, height: 1080 },
  locale: 'en-US',
  timezoneId: 'America/New_York',
  hasTouch: false,
  isMobile: false
});

// 2. Ocultar propiedades de automatización
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = { runtime: {} };
  Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
});

// 3. Interceptar TODAS las respuestas JSON (no filtrar por content-type)
page.on('response', async (response) => {
  const text = await response.text();
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    // Parsear y detectar estructura de vehículos
  }
});
```

**Resultado**: ✅ Funciona perfectamente en Cloud Run con `headless: true`

### Extracción de Datos

- **Endpoint real detectado**: `lots/search-results` (no `/lotSearchResults` que retorna HTML)
- **20 vehículos** por búsqueda
- **12-13 imágenes** por vehículo en 3 resoluciones
- **Datos extendidos** para primeros 5 vehículos
- **Tiempo de respuesta**: 1-2 segundos (vs 15s antes de la optimización)

### Headless Mode en Cloud Run

```typescript
// Detección automática de entorno
const isContainer = !!process.env.K_SERVICE || process.env.NODE_ENV === 'production';
const useHeadless = headlessEnv ? headlessEnv !== 'false' : isContainer;

// Chromium flags optimizados
const browserArgs = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-setuid-sandbox',
  '--disable-background-networking',
  '--disable-background-timer-throttling'
];
```

## 🧪 Testing

**Test Suite: 54 tests, 100% passing**

```bash
npm test
```

**Test Coverage:**
- ✅ **VehicleRepository** (16 tests) - Database operations (upsert, search, GDPR)
- ✅ **VehicleTransformer** (3 tests) - API data transformation
- ✅ **ScraperController** (8 tests) - API endpoints (scrape, search, vehicleByLot)
- ✅ **Authentication** (6 tests) - API key and admin token validation
- ✅ **Validation** (10 tests) - Request validation and sanitization
- ✅ **VehicleMapper** (2 tests) - Data format mapping
- ✅ **Copart Extractors** (9 tests) - VIN, images, highlights, details extraction

**Manual Interactive Testing:**

```bash
# PowerShell
cd tests
.\test-api.ps1

# Bash
cd tests
bash test-api.sh

# Interactive
.\test-api-interactive.ps1
```

## 🛠️ Scripts NPM

```bash
npm start          # Inicia servidor en producción
npm run dev        # Desarrollo con nodemon
npm run build      # Compila TypeScript
npm test           # Ejecuta tests (si están configurados)
```

## 📊 Ejemplo de Respuesta Optimizada

```json
{
  "success": true,
  "count": 1,
  "vehicles": [
    {
      "lot_number": "67890123",
      "vin": "2T1BURHE9FC123456",
      "year": "2015",
      "make": "Toyota",
      "model": "Corolla",
      "trim": "S Premium",
      "odometer": "89,234 mi",
      "engine": "1.8L I4",
      "transmission": "Automatic CVT",
      "exterior_color": "Super White",
      "current_bid": "$4,200",
      "sale_status": "LIVE",
      "images": [
        {
          "thumbnail": "https://cs.copart.com/...thb.jpg",
          "full": "https://cs.copart.com/...ful.jpg",
          "high_res": "https://cs.copart.com/...hrs.jpg"
        }
      ],
      "image_count": 5,
      "highlights": [
        "Clean interior condition",
        "All airbags intact",
        "Runs and drives"
      ]
    }
  ]
}
```

Ver [ejemplo completo](docs/ejemplo-respuesta-optimizada.json) con múltiples vehículos.

## 🔧 Configuración

### Variables de Entorno (.env)

```env
# Server Configuration
NODE_ENV=development
PORT=3000

# API Security (generar con crypto.randomBytes(32).toString('hex'))
API_KEY=your-secure-api-key-here
ADMIN_TOKEN=your-secure-admin-token-here

# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT_PATH=./your-firebase-adminsdk.json

# Sentry Error Tracking
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Redis Configuration (opcional - fallback a memoria)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS Origins (separados por comas)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Playwright Configuration
HEADLESS=true
BROWSER_TIMEOUT=60000

# Scraping Limits
MAX_ITEMS_PER_REQUEST=15
MAX_EXTENDED_DATA_ITEMS=5
```

### Generar API Keys Seguras

```bash
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📝 Notas

- **Copart.com** usa protección Incapsula/WAF - completamente bypassed con anti-detección
- **Firebase Firestore** - Base de datos compartida con frontend SUM-Trading
- **Redis** - Cache opcional, fallback a memoria si no está disponible
- **Sentry** - Monitoreo de errores con sampling del 10% en producción
- **Cloud Run** soportado con headless mode optimizado
- **CI/CD** configurado para deploy automático al push a main
- **IAM authentication** habilitado para seguridad
- Los datos están optimizados para UI (35+ campos por vehículo)
- **Automatización completa** - Scraping → Guardado → Cache → Analytics

## 🔐 Seguridad

### Implementaciones de Seguridad

- ✅ **API Key Authentication** - Endpoints protegidos con X-API-Key header
- ✅ **Rate Limiting** - Redis-backed con fallback a memoria (60 req/min por IP)
- ✅ **CORS** - Configurado para dominios específicos (sumtrading.us, etc.)
- ✅ **Helmet** - Security headers (CSP, XSS protection, etc.)
- ✅ **Input Validation** - Zod schemas para todos los endpoints
- ✅ **Error Handling** - Errores sanitizados, nunca exponer stack traces
- ✅ **Secrets Management** - .env no commiteado, service account keys protegidos
- ✅ **GDPR Compliance** - Endpoints para data access/deletion requests

### Service Account Keys

⚠️ **NUNCA commitear** archivos `*firebase-adminsdk*.json` al repositorio.  
Ya están en `.gitignore` por seguridad.

## 📊 Monitoreo y Analytics

### Sentry Integration

```typescript
// Captura automática de errores
throw new Error('Something went wrong');

// Captura manual
SentryService.captureException(error, { context: 'scraping' });

// Mensajes informativos
SentryService.captureMessage('Scraping completed', 'info');
```

### Métricas Disponibles

- **API Health**: `GET /api/health` - Estado del servidor
- **Metrics**: `GET /api/metrics` - Métricas detalladas (RPS, response time, cache hit rate)
- **Popular Searches**: Firestore analytics automático
- **API Usage Logs**: Todas las requests guardadas en `api_requests` collection

## 🤝 Integración

### Con Next.js/React

```javascript
const response = await fetch('https://scraptpress-svevwtmiva-rj.a.run.app/api/scraper/vehicles', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json' 
  },
  body: JSON.stringify({ query: 'toyota', count: 2 })
});

const data = await response.json();
// Usa data.vehicles para renderizar
```

### Obtener Token de Autenticación

```bash
# PowerShell
$token = gcloud auth print-identity-token

# Bash
TOKEN=$(gcloud auth print-identity-token)
```

## 📦 Tecnologías

### Core Stack
- **Node.js** v20.x - Runtime
- **TypeScript** 5.9 - Tipado estático
- **Express** 4.21 - Framework web

### Database & Cache
- **Firebase Firestore** - NoSQL cloud database
- **Firebase Admin SDK** - Server-side Firestore access
- **Redis** 7 - Cache y rate limiting (Docker)

### Scraping
- **Playwright** 1.56 - Automatización de navegador con anti-detección

### Security & Validation
- **Helmet** 7.1 - Security headers
- **CORS** 2.8 - Cross-origin resource sharing
- **Zod** 3.22 - Schema validation

### Monitoring & Logging
- **Sentry** - Error tracking y performance monitoring
- **Winston** (custom Logger) - Structured logging

### Development & Testing
- **Nodemon** - Hot reload en desarrollo
- **Jest** - Testing framework
- **ts-jest** - TypeScript support para Jest
- **ts-node** - TypeScript execution

### DevOps
- **Docker** - Containerización de Redis
- **Docker Compose** - Orchestration
- **GitHub Actions** - CI/CD pipeline

## ⚖️ Licencia

ISC License - Ver [LICENSE](LICENSE) para más detalles.

## 📚 Documentación

La documentación está organizada en:

- **[docs/](docs/)** - Documentación técnica adicional
  - `setup/FIRESTORE-INDEXES.md` - Configuración de Firebase
  - `deployment/CI-CD-SETUP.md` - CI/CD con GitHub Actions
  - `architecture/ADD_NEW_PLATFORM.md` - Extensibilidad
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Guía para contribuir
- **[SECURITY.md](SECURITY.md)** - Política de seguridad
- **[CHANGELOG.md](CHANGELOG.md)** - Historial de cambios
- **[.env.example](.env.example)** - Configuración de variables de entorno

## 🆘 Soporte

Para problemas o preguntas:
1. Revisa [CONTRIBUTING.md](CONTRIBUTING.md) para convenciones
2. Consulta la [documentación en docs/](docs/)
3. Revisa los logs con `npm run dev`

---

**Última actualización**: 14 de noviembre de 2025  
**Versión**: 2.1.0  
**Estado**: ✅ Production Ready con Navegación Mejorada  
**Región**: southamerica-east1  

**Características destacadas**:
- ✅ **Navegación Triple Estrategia** - Click directo en páginas + botón Siguiente + URL fallback
- ✅ Anti-bot detection funcional (Incapsula bypassed)
- ✅ Sistema de Locks anti-duplicación (scraping coordinado)
- ✅ Prefetch inteligente con espera de locks (máx 6 min)
- ✅ Headless mode optimizado para Cloud Run
- ✅ Firebase Firestore integrado (NoSQL cloud)
- ✅ Redis caching con Docker
- ✅ Sentry error tracking activo
- ✅ Security completa (API keys, CORS, Helmet, Zod)
- ✅ Batching de 100 vehículos (1 scrape = 10 páginas frontend)
- ✅ 12-13 imágenes en 3 resoluciones por vehículo
- ✅ CI/CD automático desde GitHub
- ✅ Guardado automático de vehículos en Firestore
- ✅ Analytics de búsquedas y API usage
- ✅ GDPR compliance endpoints

**📚 Documentación para No Técnicos:**
- [Cómo Funciona el Scraping](docs/COMO-FUNCIONA-SCRAPING.md) - Explicación simple del sistema

**Stack Tecnológico**:
- Backend: Node.js 20 + TypeScript 5.9 + Express 4.21
- Database: Firebase Firestore (NoSQL cloud)
- Cache: Redis 7 (Docker)
- Scraping: Playwright 1.56
- Monitoring: Sentry
- Security: Helmet + CORS + Zod + API Keys
- CI/CD: GitHub Actions
