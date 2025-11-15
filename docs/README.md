# 📚 ScraptPress - Documentación

> Sistema de scraping profesional de Copart.com con arquitectura page+limit, prefetch automático y sistemas defensivos anti-detección.

**Versión actual:** 2.3.0 | **Fecha:** 15 de noviembre de 2025

---

## 🚀 Inicio Rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno
cp .env.example .env
# Edita .env con tus credenciales

# 3. Iniciar Redis
docker compose -f docker-compose.redis.yml up -d

# 4. Desplegar índices de Firestore
firebase deploy --only firestore:indexes

# 5. Iniciar servidor
npm run dev
```

**Servidor disponible en**: http://localhost:3000

---

## 📂 Estructura de Documentación

```
docs/
├── README.md                          # 👈 Estás aquí - Inicio
├── ARCHITECTURE-V2.3.md               # 🏗️ Arquitectura page+limit (NUEVO)
├── API-REFERENCE.md                   # 📡 Referencia completa de API
├── COMO-FUNCIONA-SCRAPING.md          # 🎓 Guía para no técnicos
├── COPART-BLOCKING-RETRY-SYSTEM.md    # 🔄 Sistema de retry ante bloqueos
├── TESTING.md                         # 🧪 Guía de testing
├── api/
│   └── ejemplo-respuesta-optimizada.json
├── architecture/
│   └── ADD_NEW_PLATFORM.md            # 🏗️ Extensibilidad
├── deployment/
│   └── CI-CD-SETUP.md                 # 🚀 CI/CD con GitHub Actions
└── setup/
    └── FIRESTORE-INDEXES.md           # ⚙️ Configuración Firebase
```

---

## 📖 Guías Disponibles

### 🎯 Esenciales

- **[Arquitectura v2.3.0](./ARCHITECTURE-V2.3.md)** ⭐ NUEVO
  - Sistema page+limit completo
  - Comparación Opción 1 vs Opción 2 (batch)
  - Locks aislados por page+limit
  - Prefetch mejorado con validaciones
  - Estructura Firestore optimizada
  - Decisiones de diseño documentadas

- **[API Reference](./API-REFERENCE.md)** ⭐
  - Endpoint `/api/search/intelligent` con límites configurables
  - Sistema de prefetch automático
  - Ejemplos de integración (React, TypeScript, PowerShell)
  - Códigos de respuesta y troubleshooting

- **[Cómo Funciona el Scraping](./COMO-FUNCIONA-SCRAPING.md)** ⭐
  - Guía para personas no técnicas
  - Explicación simple con analogías del mundo real
  - Por qué la primera búsqueda tarda tiempo
  - Sistema de páginas visualizado
  - Preguntas frecuentes con ejemplos

- **[Sistema de Retry](./COPART-BLOCKING-RETRY-SYSTEM.md)**
  - Auto-recuperación ante bloqueos de Copart
  - 3 intentos con esperas progresivas
  - Detección Error 15 automática
  - Logs informativos con IP bloqueada

### ⚙️ Configuración

- **[Índices de Firestore](./setup/FIRESTORE-INDEXES.md)**
  - Índices compuestos para búsquedas rápidas
  - Tokens de búsqueda optimizados
  - Deploy con Firebase CLI

- **[Testing Guide](./TESTING.md)**
  - Test suite con 54 tests
  - Testing manual interactivo
  - PowerShell scripts

- **[CI/CD Setup](./deployment/CI-CD-SETUP.md)**
  - GitHub Actions pipeline
  - Deploy automático a Cloud Run
  - Secrets management

- **[Add New Platform](./architecture/ADD_NEW_PLATFORM.md)**
  - Arquitectura extensible
  - Crear nuevo platform scraper
  - Best practices

---

## 📊 Características Clave

### Sistema Page+Limit con Locks Aislados

```
Estructura: searches/{query}/cache/{page}-{limit}

Usuario selecciona límite:
- 10 vehículos  → ~2 min scraping
- 50 vehículos  → ~8 min scraping
- 100 vehículos → ~20 min scraping

Ejemplos:
searches/mazda/cache/1-10   → Página 1, 10 vehículos
searches/mazda/cache/1-50   → Página 1, 50 vehículos (INDEPENDIENTE)
searches/mazda/cache/2-10   → Página 2, 10 vehículos
```

**Ventajas**:
- ✅ **Usuario controla tiempo**: Selector 10/50/100
- ✅ **1 read Firestore por página**: Cache instantáneo
- ✅ **Sin colisiones**: Locks únicos query:page:X:limit:Y
- ✅ **TTL independiente**: Cada página expira por separado
- ✅ **Prefetch predecible**: Siguiente página con mismo límite
- ✅ **Locks aislados**: 1-10 no bloquea 1-50
- ✅ **Espera inteligente**: Máximo 15 minutos con auto-liberación

### Sistemas Defensivos Anti-Detección

**1. Rate Limiter**
- Máximo 10 scrapes por minuto
- Máximo 3 scrapes concurrentes
- Detección automática de límites (HTTP 429, CAPTCHA)
- Backoff de 60 segundos

**2. Proxy Rotator**
- Rotación round-robin entre proxies
- Health checks automáticos
- Cooldown de 5 minutos para proxies fallidos
- Configuración vía variables de entorno

**3. Queue System**
- Cola con prioridades
- Máximo 3 tareas concurrentes
- Rate limiting: 5 tareas por 10 segundos
- Sin dependencias externas

### Sistema de Locks Anti-Duplicación

**Problema resuelto**: Múltiples requests al mismo batch causan scraping duplicado.

**Solución implementada**:

```typescript
// 1. Verificar si hay lock activo
if (scrapingLockService.isLocked(query, batchNumber)) {
  // Esperar hasta que el otro proceso termine (max 6 min)
  await scrapingLockService.waitForLock(query, batchNumber);
  // Buscar en cache (ya debe estar disponible)
  return fromCache();
}

// 2. Adquirir lock antes de scrapear
const lockId = scrapingLockService.acquireLock(query, batchNumber);

// 3. Scrapear con seguridad
try {
  const vehicles = await platform.scrape(...);
  await BatchRepository.saveBatch(...);
} finally {
  // 4. SIEMPRE liberar lock
  scrapingLockService.releaseLock(query, batchNumber, lockId);
}
```

**Características**:
- ✅ Locks en memoria (ultra-rápido, sin DB)
- ✅ Timeout automático de 10 minutos
- ✅ Espera inteligente con polling cada 2s
- ✅ Limpieza automática cada 5 minutos
- ✅ Lock IDs únicos para verificación

### Scraping Paralelo

- ✅ 3 vehículos procesados simultáneamente
- ✅ Páginas dedicadas para cada vehículo
- ✅ Interceptores de API independientes
- ✅ Timeouts optimizados (500ms vs 2000ms)
- ✅ Estrategia `domcontentloaded` para velocidad

---

## 🎯 Endpoint Principal

### POST /api/search/intelligent

**Búsqueda inteligente con batching**

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
  "query": "toyota",
  "page": 1,
  "limit": 10,
  "returned": 10,
  "batch": {
    "number": 0,
    "size": 100,
    "currentPageInBatch": 1,
    "totalPagesInBatch": 10,
    "hasMoreInBatch": true
  },
  "prefetch": {
    "recommended": false
  },
  "vehicles": [...]
}
```

Ver [API-REFERENCE.md](./API-REFERENCE.md) para documentación completa.

---

## 📊 Métricas de Rendimiento

| Operación | Tiempo | Descripción |
|-----------|--------|-------------|
| Cache Hit (Firestore) | < 2s | Instantáneo (7 días TTL) |
| Scraping 10 vehículos | ~2 min | Exploración rápida |
| Scraping 50 vehículos | ~8 min | Balance velocidad/cantidad |
| Scraping 100 vehículos | ~20 min | Máximo resultados |
| Prefetch | Background | No bloquea UI |
| **Espera de Lock** | Auto | Si otro usuario scrapea misma page+limit |
| **Lock timeout** | 15 min | Expiración automática de seguridad |

---

## 🛠️ Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Servidor con hot-reload

# Producción
npm run build            # Compilar TypeScript
npm start                # Iniciar servidor

# Testing
npm test                 # Ejecutar suite de tests
cd tests ; .\test-api.ps1  # Testing manual interactivo

# Redis
docker compose up -d     # Iniciar Redis
docker compose down      # Detener Redis

# Firebase
firebase deploy --only firestore:indexes  # Desplegar índices
```

---

## 🔐 Seguridad

### API Key Authentication

Todos los endpoints requieren header `X-API-Key`:

```bash
curl http://localhost:3000/api/search/intelligent \
  -H "X-API-Key: YOUR_API_KEY"
```

### Generación de Keys Seguras

```bash
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Agregar a `.env`:

```env
API_KEYS=key1,key2,key3
```

---

## 🐛 Troubleshooting

### Redis no conecta

```bash
# Verificar Redis
docker ps | grep redis

# Reiniciar
docker compose -f docker-compose.redis.yml restart

# Ver logs
docker logs scraptpress-redis
```

### Firestore lento

```bash
# Verificar índices
firebase firestore:indexes

# Redesplegar
firebase deploy --only firestore:indexes
```

### Rate Limit de Copart

El sistema detecta automáticamente y espera 60 segundos. Si persiste:

1. Esperar 1-2 horas para cooldown de IP
2. Configurar proxies (ver [SISTEMAS-DEFENSIVOS.md](../SISTEMAS-DEFENSIVOS.md))
3. Reducir concurrencia temporalmente

---

## 📚 Recursos Adicionales

- **[README Principal](../README.md)** - Overview del proyecto
- **[Implementación Final](./implementation/IMPLEMENTACION-FINAL.md)** - Guía completa v2.0
- **[Sistemas Defensivos](./architecture/SISTEMAS-DEFENSIVOS.md)** - Anti-detección
- **[CHANGELOG.md](../CHANGELOG.md)** - Historial de cambios
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Guía de contribución
- **[SECURITY.md](../SECURITY.md)** - Política de seguridad

---

## 📞 Links Útiles

- [Firebase Console](https://console.firebase.google.com)
- [Playwright Documentation](https://playwright.dev)
- [Redis Documentation](https://redis.io/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Última actualización**: 15 de noviembre de 2025  
**Versión**: 2.3.0  
**Estado**: ✅ Production Ready con Sistema Page+Limit

**Características actuales**:
- ✅ **Sistema page+limit** (usuario selecciona 10/50/100 vehículos)
- ✅ **Locks aislados** por page+limit (sin colisiones)
- ✅ **Prefetch mejorado** (activa después cache hits Y scraping)
- ✅ **Popular searches** con instant results indicator
- ✅ **Validación lot numbers** (estructura Firestore limpia)
- ✅ Sistema de retry ante bloqueos (3 intentos automáticos)
- ✅ Scraping paralelo (3 vehículos simultáneos)
- ✅ Cache Firestore con TTL 7 días
- ✅ Anti-detección Incapsula/WAF
- ✅ VIN completo + 12+ imágenes por vehículo
- ✅ Firebase Firestore optimizado

**📚 Nueva Documentación:**
- [Arquitectura v2.3.0](./ARCHITECTURE-V2.3.md) ⭐ NUEVO - Sistema page+limit completo
