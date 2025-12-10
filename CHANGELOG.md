# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.2.0] - 2025-12-10

### 🚀 MAJOR RELEASE - API Interception & Hybrid Caching

Reemplazo total del motor de extracción por "Smart API Interception" y arquitectura de caching multi-nivel.

### Added
- **🕵️‍♂️ Smart API Interception Strategy**
  - Intercepta tráfico JSON interno de Copart.
  - Velocidad: 18s (antes 140s).
  - Costo: $0.00 (antes AI costs).
  - Precisión: 100% de datos crudos.
  
- **🧠 Hybrid Caching System**
  - **L1 Redis**: Cache en memoria (<30ms response). Keys con soporte de paginación.
  - **L2 Firestore**: Persistencia por 7 días.

- **🔄 Live Synchronization**
  - Sync automático de resultados de búsqueda a collection `copart_vehicles`.
  - Soporte para prefetching background.

### Changed
- **Architecture**:
  - Eliminado: `GeminiService`, `AIListExtractor` (Obsoletos).
  - Eliminado: Dependencias `@google/generative-ai`.
  - Modificado: `SearchController` para consultar Redis -> Firestore -> API.

### Fixed
- **Credentials Path**: Solucionado bug `ENOENT` en `firebase.ts` para carga de credenciales.
- **Search Endpoint**: Corrección de rutas `/api/search/vehicles`.

## [3.1.0] - 2025-11-16

### 🚀 MAJOR RELEASE - Async Worker Architecture

Arquitectura de workers asíncronos con Redis Queue, rate limiting avanzado, validación de seguridad XSS/injection, y auto-scaling horizontal (2-20 workers).

### Added
- **⚡ Async Worker System**
  - Worker dedicado (`src/worker.ts`) para procesar scraping en background
  - Redis Queue persistente (Bull/BullMQ) con Redis Labs
  - Modo async: Respuesta inmediata con `batchId`, polling para resultado
  - Concurrencia configurable (WORKER_CONCURRENCY env var)
  - Graceful shutdown con finalización de jobs activos
  - Auto-retry con exponential backoff (3 intentos)
  
- **🔒 Job Queue Security Service**
  - Rate limiting por IP: 5 requests/min, 5 búsquedas simultáneas
  - Rate limiting por API Key: 50 requests/min, 10 búsquedas simultáneas
  - Validación de queries: bloqueo de XSS (`<script>`, `javascript:`, etc)
  - Sanitización automática (trim, normalización espacios)
  - Límites de paginación: max página 50, max limit 100
  - Priority queue: Premium API keys obtienen high priority
  
- **📊 New Endpoints**
  - `GET /api/search/intelligent?async=true` - Queue job, respuesta inmediata
  - `GET /api/search/status/:batchId` - Consultar progreso de job
  - Job status tracking en Firestore (queued → processing → completed/failed)
  
- **🏗️ Architecture Improvements**
  - SearchController refactorizado con modo sync/async
  - BatchRepository extendido: `updateJobStatus()`, `getJobStatus()`
  - JobQueueManager con soporte de genéricos TypeScript
  - SecurityConfig centralizado con validación de env vars
  
- **📦 Deployment**
  - `Dockerfile.worker` para workers containerizados
  - `deploy-cloud-run.ps1` script automatizado
  - npm scripts: `start:worker`, `dev:worker`, `docker:build-worker`
  - Cloud Run ready: API (1-10 inst), Workers (2-20 inst)
  
- **📚 Documentation**
  - `docs/WORKER-ARCHITECTURE.md` - Arquitectura completa
  - Diagramas de flujo async
  - Ejemplos de uso con polling
  - Guías de deployment Cloud Run y Kubernetes

### Changed
- **Environment Variables Cleanup**
  - Eliminadas: `LOCK_TIMEOUT_MINUTES`, `ENABLE_DEBUG_LOGS`, `MONGODB_URI`, `SCRAPTPRESS_API_URL/KEY`
  - Agregadas: 9 variables de seguridad (`RATE_LIMIT_*`, `MAX_JOBS_*`, `WORKER_CONCURRENCY`, etc)
  - Simplificado de 30 → 24 variables
  
- **Project Structure**
  - Movido `studio-*.json` → `config/credentials/` (gitignored)
  - Movido `test-response.json` → `tests/fixtures/`
  - Movido `switch-env.ps1` → `scripts/`
  - Movido `docker-compose.redis.yml`, `Dockerfile.worker` → `docker/`
  - Eliminados: `.env.local`, `.env.yaml` (duplicados)
  
- **Documentation Cleanup**
  - Eliminados: `ARCHITECTURE-V2.3.md`, `ARCHITECTURE-AI-V3.0.md`, `COMO-FUNCIONA-SCRAPING.md`, `COPART-BLOCKING-RETRY-SYSTEM.md`
  - Consolidado en: `WORKER-ARCHITECTURE.md` y `README.md`
  - Eliminada carpeta vacía: `docs/deployment/`
  
- **README.md Rewrite**
  - Documentación v3.1 con workers
  - Diagramas de arquitectura actualizados
  - Tabla de rendimiento con async mode
  - Quick start y deployment guides
  - Estructura de proyecto actualizada

### Performance
- **Capacidad**: 1 búsqueda simultánea → 60 (20 workers × 3 concurrency)
- **Response Time (Async)**: 30-60s → <100ms (respuesta inmediata)
- **Throughput**: 60x mejora en picos de demanda

### Security
- XSS/Injection protection en queries
- Rate limiting multinivel (IP + API key)
- Max concurrent jobs enforcement
- Query sanitization automática
- Environment validation on startup

### Cost
- Estimated: $35-160/mes según demanda
- ROI: 60x capacidad con 3-4x costo

---

## [3.0.0] - 2025-11-15

### 🚀 MAJOR RELEASE - AI-Powered Extraction

Esta es una actualización mayor que introduce **extracción con inteligencia artificial** usando Google Gemini Flash 1.5, mejorando la velocidad en **85%** y la robustez del sistema.

### Added
- **🤖 AI-Powered Extraction System**
  - Integración de Google Gemini Flash 1.5 (Vision API)
  - Extracción mediante análisis visual de screenshots
  - 85% más rápido: 100 vehículos en ~3 min (antes 20 min)
  - Independiente de selectores CSS (resistente a cambios en Copart)
  
- **Servicios de IA (Capa Nueva)**
  - `GeminiService` - Cliente Gemini con retry automático y cache
    - Exponential backoff para rate limits (2s, 4s, 8s)
    - Cache de resultados (TTL: 1 hora)
    - Tracking de tokens y costos
    - Safety settings optimizados
  - `ScreenshotService` - Capturas optimizadas para AI
    - Full page screenshots con scroll automático
    - Limpieza de ads, popups, captchas
    - Lazy-loaded content handling
    - Optimización de tamaño (PNG, base64)
  - `AIExtractorService` - Orquestador principal
    - Coordinación screenshot + Gemini
    - Validación de calidad (threshold 50%)
    - Normalización de datos AI → VehicleData
    - Cálculo de confidence score
    
- **Extractor Híbrido para Copart**
  - `AIListExtractor` - Nuevo extractor con IA
    - Conversión de formato AI a VehicleData
    - Validación de calidad multi-factor
    - Métricas de completeness
    - Logs informativos detallados
    
- **Estrategia de 3 Niveles con Fallback**
  - **Strategy 1**: AI Extraction (~45s) ⚡ FASTEST
  - **Strategy 2**: API Interception (~1 min) 📡 Traditional
  - **Strategy 3**: DOM Scraping (~2 min) 🔧 Last Resort
  - Success rate combinado: ~99.5%
  
- **Prompt Engineering Optimizado**
  - Prompt específico para Copart con 15 campos
  - Instrucciones estrictas (exactitud, no inventar datos)
  - Output en JSON estricto
  - Reglas de formato (commas, caps, null handling)
  
- **Variables de Entorno para IA**
  - `GEMINI_API_KEY` - API key de Google AI Studio
  - `ENABLE_AI_EXTRACTION` - Flag para habilitar/deshabilitar IA
  - Configuración en `.env` y `.env.example`
  
- **Documentación Completa de IA**
  - `ARCHITECTURE-AI-V3.0.md` - Arquitectura detallada
    - Explicación de 3 capas (AI, Extractors, Platform)
    - Flujos de extracción completos
    - Diagramas de estrategias
    - Métricas de rendimiento
    - Costos y pricing (~$4/1000 búsquedas)
    - Comparación tradicional vs AI
    - Roadmap futuro (v3.1, v3.2, v3.3)
  - README actualizado con features de AI
  - Keywords nuevos en package.json: ai, gemini, vision-ai, ml

### Changed
- **CopartPlatform Mejorado**
  - `initializeAI()` - Setup automático de servicios de IA
  - Detección de `GEMINI_API_KEY` en environment
  - Flag `useAI` para control de activación
  - Integración transparente con código existente
  - `scrapeSearchInternal()` modificado con 3 estrategias
  - Logs informativos para cada estrategia
  
- **Versión del Proyecto**
  - package.json: 2.3.0 → 3.0.0
  - Descripción actualizada con AI features
  - Keywords expandidos (ai, gemini, vision-ai, ml)

### Performance Improvements
- **10 vehículos**: 2 min → **30 seg** (75% mejora) ⚡
- **50 vehículos**: 8 min → **1.5 min** (81% mejora) ⚡
- **100 vehículos**: 20 min → **3 min** (85% mejora) ⚡
- Menos requests HTTP a Copart (menos bloqueos)
- Cache de resultados de IA (1 hora TTL)
- Fallback automático sin degradación

### Technical Details
- **Dependencies Added**
  - `@google/generative-ai` ^0.21.0 - SDK oficial de Gemini
  
- **Architecture Layers**
  ```
  src/services/ai/              ← Nueva capa de IA
  ├── gemini.service.ts
  ├── screenshot.service.ts
  └── ai-extractor.service.ts
  
  src/services/scrapers/platforms/copart/extractors/
  └── ai-list.extractor.ts      ← Nuevo extractor híbrido
  ```

### Cost Analysis
- Gemini Flash 1.5: ~$0.004 por búsqueda
- 1000 búsquedas: ~$4 USD
- Trade-off: costo bajo vs 85% ahorro de tiempo
- Ahorro en compute de Cloud Run compensa costo de API

### Backward Compatibility
- ✅ **100% compatible** con v2.3.0
- ✅ Funciona sin IA si `GEMINI_API_KEY` no está configurada
- ✅ Fallback automático a métodos tradicionales
- ✅ Sin cambios en API externa (mismos endpoints)
- ✅ Sin cambios en formato de respuesta
- ✅ Firestore structure sin cambios

### Future Roadmap
- v3.1: Enriquecimiento selectivo (solo vehículos visibles)
- v3.2: AI para páginas individuales de vehículos
- v3.3: Multi-model fallback (Gemini Pro, Claude Haiku)

---

## [2.3.0] - 2025-11-15

### Added
- **Sistema Page+Limit (Opción 1)** - Arquitectura completamente nueva
  - Estructura: `searches/{query}/cache/{page}-{limit}`
  - Usuario selecciona límite: 10 (~2min), 50 (~8min), 100 (~20min)
  - Locks aislados: `query:page:X:limit:Y` sin colisiones
  - TTL independiente por documento de página
  - Prefetch predecible (siguiente página con mismo límite)
- **Selector de Límite en Frontend**
  - Dropdown con 3 opciones: 10/50/100 resultados
  - Estimación de tiempo por opción
  - Todos los entry points actualizados (SearchBar, Header, Mobile, Hero)
- **Prefetch Mejorado**
  - Función `triggerPrefetch()` helper centralizada
  - Activa después de cache hits Y después de scraping exitoso
  - Validaciones: existencia en cache, lock activo, límite válido
  - Background execution sin bloquear UI
- **Popular Searches con Instant Results**
  - Endpoint `/api/popular-searches` con top queries
  - Componente PopularSearches con badges y loading skeleton
  - Texto mejorado: "resultados al instante" (más claro que "en caché")
  - Integrado en hero-content.tsx
- **Validación de Lot Numbers**
  - Regex `/^\d+$/` detecta lot numbers (vehículos específicos)
  - Skip metadata creation para evitar contaminación en searches/
  - Logs informativos: "⏭️ Skipping metadata for lot number"
  - Estructura Firestore limpia: solo queries de búsqueda
- **Scripts de Utilidad**
  - `check-firestore-structure.ts` - Ver estructura completa con detalles
  - `cleanup-lot-numbers.ts` - Limpieza automática de lot numbers
  - Excluidos de tsconfig.json para evitar errores de compilación
- **Documentación Actualizada**
  - ARCHITECTURE-V2.3.md - Explicación completa del sistema page+limit
  - Comparación Opción 1 vs Opción 2 (batch)
  - Diagramas de flujo completos
  - Decisiones de diseño documentadas

### Changed
- Frontend usa `limit` parameter en vez de calcular batches
- Backend `savePage()` y `getPage()` con page+limit parameters
- ScrapingLockService con lock key format: `query:page:X:limit:Y`
- Navegación simplificada: cada página = 1 fetch al backend
- Cache estructura: `{page}-{limit}` en vez de batches complejos
- Logs mejorados con indicadores de page+limit en todas las operaciones

### Fixed
- Numeric documents en Firestore (lot numbers creaban metadata)
- Colisiones entre límites diferentes (1-10 vs 1-50)
- Prefetch solo activaba en cache hits (ahora también post-scraping)
- "page is not defined" error en search page
- Texto técnico "en caché" confuso para usuarios
- Mobile header sin límite parameter en redirect

### Improved
- Reducción de complejidad: page+limit vs batch calculations
- Granularidad de locks: por página exacta (no batch completo)
- UX: usuario controla tiempo de scraping (10/50/100)
- Mantenibilidad: código más simple y fácil de debuguear
- Escalabilidad: locks aislados permiten más concurrencia
- Firestore structure: solo queries válidos, sin contaminación

### Documentation
- Nueva arquitectura documentada en ARCHITECTURE-V2.3.md
- README.md actualizado con sistema page+limit
- API-REFERENCE.md con nuevos parámetros
- Scripts de utilidad documentados
- Comparación Opción 1 vs Opción 2 con pros/cons

## [2.2.0] - 2025-11-15

### Added
- **Sistema de Retry Inteligente** - Auto-recuperación ante bloqueos de Copart
  - Detecta Error 15 (Access Denied) automáticamente mediante parsing HTML
  - 3 intentos automáticos con esperas progresivas: 2min → 5min → 10min
  - Logs informativos con IP bloqueada extraída del HTML de Imperva
  - Detección temprana después de page.goto() para no perder tiempo
  - No requiere intervención manual, el sistema se recupera solo
- **Timeouts sin límites estrictos** para manejar bloqueos prolongados
  - Playwright: timeout: 0 (sin límite individual en operaciones)
  - Lock: 15 minutos (auto-libera para permitir otros intentos)
  - Cloud Run: 15 minutos (balance entre espera y recursos)
  - Frontend: sin timeout en fetch, mensaje informativo a los 6 minutos
- **Caché extendido a 7 días** (antes 24 horas)
  - Redis (Upstash): 7 días TTL
  - Firestore: 7 días TTL
  - Reduce re-scraping innecesario y ahorra recursos

### Changed
- Frontend: Loader persistente con mensaje informativo a los 6 minutos
  - "Copart está restringiendo el acceso, puede tomar más tiempo"
  - Usuario puede decidir si espera o vuelve más tarde
  - No se genera error por timeout, solo espera hasta completar
- Sistema 99% resiliente: solo falla si los 3 reintentos agotan (muy raro)
- Lock se libera inmediatamente al terminar (no espera 15 min si termina en 5 min)

### Fixed
- Manejo robusto de bloqueos temporales de Copart (Error 15)
- Prevención de errores falsos por timeouts agresivos
- Sistema de permisos Secret Manager en Cloud Run configurado correctamente

## [2.1.0] - 2025-11-14

### Added
- **Sistema de Navegación Triple Estrategia** para máxima confiabilidad en paginación
  - Estrategia 1: Click directo en número de página (más rápido, 1 click)
  - Estrategia 2: Click en botón "Siguiente" (para páginas lejanas no visibles)
  - Estrategia 3: URL directa (fallback de emergencia si fallan las anteriores)
- Detección automática de página actual desde botón activo
- Validación de botones deshabilitados antes de hacer click
- Múltiples selectores para cada estrategia (máxima compatibilidad)
- Documentación para no técnicos (COMO-FUNCIONA-SCRAPING.md)
  - Explicación simple del scraping
  - Por qué la primera búsqueda tarda 4-5 minutos
  - Sistema de lotes (batches) explicado visualmente
  - Preguntas frecuentes con analogías del mundo real
  - Comparaciones visuales y consejos de uso

### Changed
- Navegación a páginas de Copart ahora se hace **después** de cambiar a vista clásica
- Navegación a páginas de Copart ahora se hace **después** de configurar tamaño de página
- URL con `?page=X` se construye solo después de setup completo
- Mejora en logs de navegación con indicadores de estrategia usada

### Fixed
- ✅ **Bug crítico**: Batch 1 duplicaba contenido de Batch 0
  - Causa: `currentPage = page - 1 + i` causaba mapeo incorrecto (0-indexed vs 1-indexed)
  - Solución: `currentPage = page + i` (Copart usa páginas 1-indexed)
- ✅ **Bug crítico**: Navegación directa a página lejana (ej. página 7) mostraba pantalla vacía
  - Causa: Frontend intentaba mostrar desde cache local vacío
  - Solución: Eliminado cache local, fetch directo a backend por página (confía 100% en Firestore → Scraping)
- Mejor manejo de errores al hacer click en botones de paginación
- Eliminado componente obsoleto `copart-results.tsx` (343 líneas) reemplazado por `copart-results-simple.tsx` (200 líneas)

### Improved
- Navegación más natural y humana (simula usuario real)
- Menos dependencia de parámetros URL (más confiable)
- Frontend simplificado: 200 líneas vs 343 (reducción del 42%)
- Logs más descriptivos con emojis y estrategias identificadas

### Documentation
- README.md actualizado con sistema de navegación triple estrategia
- docs/README.md actualizado con nueva versión 2.1.0
- Nuevo documento COMO-FUNCIONA-SCRAPING.md para audiencia no técnica
- Sección de optimizaciones v2.1 en README principal

## [2.0.0] - 2025-11-13

### Added
- Sistema de logging estructurado con 5 niveles (INFO, SUCCESS, WARN, ERROR, DEBUG)
- Frontend público con batching de 100 vehículos y prefetch inteligente
- Documentación organizada según best practices de GitHub

### Changed
- Logger.ts completamente reescrito con colores ANSI y formato timestamp
- public/app.js reescrito para usar /api/search/intelligent endpoint
- Documentación reorganizada en docs/ con estructura clara

### Security
- Añadido CONTRIBUTING.md con guías de seguridad
- Añadido SECURITY.md con políticas de seguridad
- Mejorada validación de inputs en todos los endpoints

## [1.1.0] - 2025-11-12

### Added
- Sistema de batching optimizado (100 vehículos por batch)
- Prefetch inteligente en páginas 4+, 14+, 24+
- Rate limiter defensivo (10 req/min, 3 concurrentes)
- Proxy rotator con health checks y cooldown
- Queue system para controlar concurrencia
- Endpoint POST /api/search/intelligent con batching
- Redis cache multi-nivel con TTL configurables
- Documentación de sistemas defensivos (SISTEMAS-DEFENSIVOS.md)
- API-REFERENCE.md con documentación completa de endpoints
- IMPLEMENTACION-FINAL.md con guía de implementación

### Changed
- Scraping paralelo optimizado (3 vehículos simultáneos)
- Timeouts reducidos de 2000ms a 500ms (8x más rápido)
- Estructura de batches: 100 vehículos = 10 páginas frontend
- Cache strategy: Redis → Firestore → Scraping
- Logging mejorado con secciones y timestamps

### Fixed
- Rate limiting auto-detection de límites de Copart
- Proxy rotation con verificación de salud
- Error handling en scraping paralelo
- Memory leaks en cache Redis

### Performance
- Tiempo de scraping reducido 57% (26s vs 60s por vehículo)
- Cache hit < 100ms (Redis) vs < 2s (Firestore)
- Prefetch background no bloquea navegación
- Batches optimizados para Cloud Run

### Security
- Rate limiter con detección automática de límites
- Proxy rotation para distribuir requests
- Queue system para evitar sobrecarga
- Validación Zod en todos los endpoints

## [1.0.0] - 2025-11-10

### Added
- Scraping inicial de Copart con Playwright
- Firebase Firestore integration
- Redis caching layer
- API REST con Express
- Anti-detección de bots (bypass Incapsula)
- Extracción completa de VIN (sin asteriscos)
- 12+ imágenes por vehículo en 3 resoluciones
- Videos de motor cuando disponibles
- Highlights y especificaciones técnicas
- Headless mode para Cloud Run
- API key authentication
- Rate limiting básico
- CORS configuration
- Helmet security headers
- Sentry error tracking
- CI/CD con GitHub Actions
- Docker Compose para Redis
- Jest testing suite (54 tests)

### Features
- GET /api/health - Health check
- POST /api/scraper/vehicles - Scraping con límite
- GET /api/search/hybrid - Búsqueda híbrida (cache + scraping)
- GET /api/vehicle/:lotNumber - Detalles de vehículo
- GET /api/vehicle/:lotNumber/extended - Datos extendidos
- GET /api/gdpr/data/:identifier - GDPR data access
- DELETE /api/gdpr/delete/:identifier - GDPR right to be forgotten

### Infrastructure
- Cloud Run deployment configurado
- Firebase Firestore con índices compuestos
- Redis Docker container
- GitHub Actions CI/CD pipeline
- Sentry integration
- Environment-based configuration

### Documentation
- README completo con Quick Start
- API examples en PowerShell y Bash
- Firestore setup guide
- CI/CD setup guide
- Architecture documentation
- Testing guide

### Security
- API key authentication middleware
- Admin token for sensitive endpoints
- Rate limiting per IP
- CORS whitelist
- Helmet security headers
- Input validation con Zod
- Error sanitization

### Performance
- Scraping paralelo (3 vehículos simultáneos)
- Redis caching con TTL
- Firestore batch operations
- API interceptors para captura de imágenes
- Optimized timeouts (domcontentloaded)

## [0.1.0] - 2025-11-05 (Beta)

### Added
- Proof of concept inicial
- Scraping básico con Playwright
- Express server
- TypeScript configuration

### Known Issues
- Sin anti-detección (bloqueado por Incapsula)
- Sin caching
- Scraping secuencial (lento)
- Sin rate limiting
- Headless mode no funcionaba

---

## Versioning Scheme

Semantic Versioning: MAJOR.MINOR.PATCH

- **MAJOR**: Cambios incompatibles en API
- **MINOR**: Nueva funcionalidad compatible con versiones anteriores
- **PATCH**: Bug fixes compatibles

## Release Notes Guidelines

### Added
- Nuevas features implementadas

### Changed
- Cambios en funcionalidad existente

### Deprecated
- Features marcadas para remoción futura

### Removed
- Features removidas

### Fixed
- Bug fixes

### Security
- Actualizaciones de seguridad

### Performance
- Mejoras de rendimiento

---

**Links**:
- [Unreleased]: Comparar con última release
- [1.1.0]: Release con sistemas defensivos
- [1.0.0]: Primera release estable
- [0.1.0]: Beta inicial
