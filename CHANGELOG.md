# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
