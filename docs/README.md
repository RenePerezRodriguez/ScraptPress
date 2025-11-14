# 📚 ScraptPress - Documentación

> Sistema de scraping profesional de Copart.com con batching inteligente, prefetch automático y sistemas defensivos anti-detección.

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
├── COMO-FUNCIONA-SCRAPING.md          # 🎓 Guía para no técnicos (NUEVO)
├── RESUMEN-IMPLEMENTACION-v2.1.md     # 📋 Resumen completo v2.1 (NUEVO)
├── API-REFERENCE.md                   # 📡 Referencia completa de API
├── TESTING.md                         # 🧪 Guía de testing
├── api/
│   └── ejemplo-respuesta-optimizada.json
├── architecture/
│   ├── ADD_NEW_PLATFORM.md            # 🏗️ Extensibilidad
│   └── SISTEMAS-DEFENSIVOS.md         # 🛡️ Rate Limiter, Proxies, Queue
├── deployment/
│   └── CI-CD-SETUP.md                 # 🚀 CI/CD con GitHub Actions
├── implementation/
│   └── IMPLEMENTACION-FINAL.md        # ✅ Guía de implementación completa
└── setup/
    └── FIRESTORE-INDEXES.md           # ⚙️ Configuración Firebase
```

---

## 📖 Guías Disponibles

### 🎯 Esenciales

- **[Cómo Funciona el Scraping](./COMO-FUNCIONA-SCRAPING.md)** ⭐ NUEVO
  - Guía para personas no técnicas
  - Explicación simple con analogías del mundo real
  - Por qué la primera búsqueda tarda 4-5 minutos
  - Sistema de lotes (batches) visualizado
  - Preguntas frecuentes con ejemplos

- **[Resumen Implementación v2.1](./RESUMEN-IMPLEMENTACION-v2.1.md)** ⭐ NUEVO
  - Changelog detallado de la versión 2.1.0
  - Problemas resueltos con explicaciones técnicas
  - Comparación antes vs ahora
  - Archivos modificados y testing realizado
  - Métricas de mejora y próximos pasos

- **[API Reference](./API-REFERENCE.md)** ⭐
  - Endpoint `/api/search/intelligent` (batching de 100 vehículos)
  - Sistema de prefetch automático
  - Ejemplos de integración (React, TypeScript, PowerShell)
  - Códigos de respuesta y troubleshooting

- **[Implementación Final](./implementation/IMPLEMENTACION-FINAL.md)** ⭐
  - Guía completa de implementación v2.0
  - Sistema de batching y prefetch
  - Logger estructurado con 5 niveles
  - Frontend completo en public/

- **[Sistemas Defensivos](./architecture/SISTEMAS-DEFENSIVOS.md)** ⭐
  - Rate Limiter (10 req/min, 3 concurrentes max)
  - Proxy Rotator (con health checks)
  - Queue System (tareas con prioridad)
  - Estrategias Safe/Balanced/Aggressive

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

### Sistema de Batching Inteligente con Locks

```
Frontend: 10 vehículos por página
Backend: 100 vehículos por batch (1 página de Copart)

┌──────────────────────────────────────────────┐
│ Batch 0 (100 veh) → Frontend páginas 1-10   │
│ Batch 1 (100 veh) → Frontend páginas 11-20  │
│ Batch 2 (100 veh) → Frontend páginas 21-30  │
└──────────────────────────────────────────────┘
```

**Ventajas**:
- ✅ Una sola request a Copart = 10 páginas frontend
- ✅ Navegación instantánea entre páginas del mismo batch
- ✅ Prefetch automático cuando llega a página 3, 13, 23, etc.
- ✅ **Sistema de Locks**: Evita scraping duplicado del mismo batch
- ✅ **Espera Inteligente**: Si otro proceso scrapea, espera hasta 6 min
- ✅ **Race Condition Safe**: Múltiples requests coordinados

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
| Cache Hit (Redis) | < 100ms | Instantáneo |
| Cache Hit (Firestore) | < 2s | Muy rápido |
| Scraping 100 vehículos | ~4-5 min | Un batch completo |
| Navegación (cached) | < 100ms | Entre páginas del mismo batch |
| Prefetch | Background | No bloquea UI |
| **Espera de Lock** | 30s-4min | Si otro proceso scrapea el mismo batch |
| **Lock timeout** | 10 min | Expiración automática de seguridad |

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

**Última actualización**: 14 de noviembre de 2025  
**Versión**: 2.1.0  
**Estado**: ✅ Production Ready con Navegación Mejorada

**Características actuales**:
- ✅ Batching de 100 vehículos (1 página Copart = 10 páginas frontend)
- ✅ **Sistema de Navegación Triple Estrategia** (click directo + botón Siguiente + URL)
- ✅ **Sistema de Locks anti-duplicación** (race condition safe)
- ✅ Prefetch inteligente con espera de locks (activación en pág 3+)
- ✅ 3 sistemas defensivos (Rate Limiter, Proxy Rotator, Queue)
- ✅ Scraping paralelo (3 vehículos simultáneos)
- ✅ Cache multi-nivel (Redis + Firestore)
- ✅ Anti-detección Incapsula/WAF
- ✅ VIN completo + 12+ imágenes por vehículo
- ✅ Firebase Firestore con índices optimizados

**📚 Nueva Documentación:**
- [Cómo Funciona el Scraping](./COMO-FUNCIONA-SCRAPING.md) ⭐ NUEVO - Guía para no técnicos
