# Contributing to ScraptPress

Gracias por tu interés en contribuir a ScraptPress! Esta guía te ayudará a entender la estructura del proyecto y las convenciones que seguimos.

## 📋 Tabla de Contenidos

- [Configuración del Entorno](#configuración-del-entorno)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Convenciones de Código](#convenciones-de-código)
- [Flujo de Desarrollo](#flujo-de-desarrollo)
- [Testing](#testing)
- [Commits y Pull Requests](#commits-y-pull-requests)

## 🛠️ Configuración del Entorno

### Prerequisites

- Node.js 20+
- Docker Desktop (para Redis)
- Cuenta de Firebase
- Cuenta de Sentry (opcional)

### Setup

```bash
# 1. Clonar repositorio
git clone https://github.com/RenePerezRodriguez/ScraptPress.git
cd ScraptPress

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Iniciar Redis
docker compose -f docker-compose.redis.yml up -d

# 5. Ejecutar en desarrollo
npm run dev
```

## 📦 Estructura del Proyecto

```
src/
├── index.ts                 # Punto de entrada de la aplicación
├── api/                     # Capa de API
│   ├── controllers/        # Lógica de negocio de endpoints
│   ├── routes/             # Definición de rutas
│   ├── middleware/         # Middlewares (auth, validation, rate limiting)
│   └── utils/              # Utilidades de API
├── services/               # Lógica de negocio
│   ├── scrapers/          # Implementaciones de scraping
│   ├── repositories/      # Acceso a datos (Firestore)
│   ├── cache.service.ts   # Gestión de cache (Redis)
│   └── monitoring.service.ts  # Métricas y monitoreo
├── config/                 # Configuración
│   ├── firebase.ts        # Inicialización de Firestore
│   ├── sentry.ts          # Error tracking
│   └── logger.ts          # Sistema de logging
└── types/                  # Definiciones TypeScript
```

### Conceptos Clave

#### 1. **Controllers** (src/api/controllers/)
Manejan las requests HTTP y coordinan los servicios.

```typescript
// Ejemplo: scraper.controller.ts
class ScraperController {
  async api(req: Request, res: Response) {
    // 1. Validar input
    // 2. Llamar servicios
    // 3. Formatear respuesta
    // 4. Manejar errores
  }
}
```

#### 2. **Services** (src/services/)
Contienen la lógica de negocio reutilizable.

```typescript
// Ejemplo: cache.service.ts
export class CacheService {
  async get(key: string): Promise<any> {
    // Lógica de cache
  }
}
```

#### 3. **Repositories** (src/services/repositories/)
Abstracción de acceso a datos (Firestore).

```typescript
// Ejemplo: vehicle.repository.ts
export class VehicleRepository {
  static async upsertVehicle(vehicle: any): Promise<boolean> {
    // Guardar en Firestore
  }
}
```

#### 4. **Middleware** (src/api/middleware/)
Funciones que procesan requests antes de llegar a controllers.

```typescript
// Ejemplo: auth.ts
export const requireApiKey = (req, res, next) => {
  // Validar API key
  next();
};
```

## 📝 Convenciones de Código

### TypeScript

- **Usa interfaces** para definir tipos de datos
- **Evita `any`** siempre que sea posible
- **Exports nombrados** en lugar de default exports (excepto controllers)

```typescript
// ✅ Bien
export interface VehicleData {
  lot_number: string;
  make: string;
  model: string;
}

// ❌ Evitar
export default interface VehicleData { }
```

### Naming Conventions

- **Archivos**: kebab-case (`vehicle.repository.ts`)
- **Clases**: PascalCase (`VehicleRepository`)
- **Funciones/Variables**: camelCase (`getUserById`)
- **Constantes**: UPPER_SNAKE_CASE (`MAX_ITEMS`)
- **Interfaces**: PascalCase con sufijo descriptivo (`VehicleData`, `ApiResponse`)

### Imports

Organizar imports en este orden:

```typescript
// 1. Node built-ins
import { Request, Response } from 'express';

// 2. External packages
import { z } from 'zod';

// 3. Internal modules
import { Logger } from '../../config/logger';
import { VehicleRepository } from '../../services/repositories/vehicle.repository';

// 4. Types
import type { VehicleData } from '../../types/vehicle.types';
```

### Logging

**NUNCA usar `console.log`**. Usar siempre el Logger:

```typescript
import { Logger } from '../config/logger';

const logger = Logger.getInstance();

logger.info('Operation successful', { vehicleId: '123' });
logger.error('Operation failed', error);
logger.warn('Deprecated API used');
logger.debug('Detailed debug info');
```

### Error Handling

- Usar try-catch en funciones async
- Capturar errores en Sentry para monitoring
- Nunca exponer stack traces al cliente

```typescript
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  logger.error('Operation failed:', error);
  SentryService.captureException(error);
  throw new Error('User-friendly error message');
}
```

### Comments

- Comentarios en inglés o español consistentemente
- JSDoc para funciones públicas
- Comentarios inline solo cuando la lógica no es obvia

```typescript
/**
 * Guarda un vehículo en Firestore
 * @param vehicle - Datos del vehículo a guardar
 * @returns true si se guardó exitosamente
 */
static async upsertVehicle(vehicle: VehicleData): Promise<boolean> {
  // Implementation
}
```

## 🔄 Flujo de Desarrollo

### 1. Crear Branch

```bash
git checkout -b feature/descripcion-corta
# o
git checkout -b fix/issue-123
```

### 2. Desarrollo

```bash
# Ejecutar en modo desarrollo (hot reload)
npm run dev

# Verificar tipos TypeScript
npm run typecheck

# Ejecutar tests
npm test

# Ver cobertura
npm run test:coverage
```

### 3. Build

```bash
# Compilar TypeScript
npm run build

# Verificar que compila sin errores
npm run typecheck
```

## 🧪 Testing

### Estructura de Tests

```
tests/
├── unit/                    # Tests unitarios
│   ├── services/
│   ├── repositories/
│   └── middleware/
└── integration/             # Tests de integración
    └── api.test.ts
```

### Escribir Tests

```typescript
describe('VehicleRepository', () => {
  describe('upsertVehicle', () => {
    it('should save a vehicle successfully', async () => {
      const vehicle = { /* datos de prueba */ };
      const result = await VehicleRepository.upsertVehicle(vehicle);
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      // Test error handling
    });
  });
});
```

### Ejecutar Tests

```bash
# Todos los tests
npm test

# Tests específicos
npm test -- vehicle.repository.test.ts

# Watch mode (útil durante desarrollo)
npm run test:watch

# Con cobertura
npm run test:coverage
```

### Coverage Target

- **Objetivo mínimo**: 70%
- **Priorizar**: Repositories, Services, Controllers
- **Opcional**: Middleware, Utils

## 📤 Commits y Pull Requests

### Commit Messages

Seguir Conventional Commits:

```
feat: agregar endpoint para búsqueda de vehículos
fix: corregir error de cache en Redis
docs: actualizar README con instrucciones de Firebase
refactor: simplificar lógica de scraping
test: agregar tests para VehicleRepository
chore: actualizar dependencias
```

### Pull Request Process

1. **Asegurar que todo compila**:
   ```bash
   npm run build
   npm run typecheck
   ```

2. **Tests pasando**:
   ```bash
   npm test
   ```

3. **Actualizar documentación** si es necesario

4. **Crear PR** con descripción clara:
   - Qué cambia
   - Por qué es necesario
   - Cómo probarlo

5. **Review** - esperar aprobación antes de merge

### PR Checklist

- [ ] Build compila sin errores
- [ ] Tests pasando
- [ ] No hay console.logs (usar Logger)
- [ ] Documentación actualizada
- [ ] Commit messages descriptivos
- [ ] Código formateado consistentemente

## 🔧 Herramientas Útiles

### Debugging

- **VS Code**: Usar debugger integrado
- **Logs**: Revisar en terminal con `npm run dev`
- **Sentry**: Ver errores en producción

### Monitoring

- **Firestore Console**: Ver datos guardados
- **Sentry Dashboard**: Tracking de errores
- **Redis CLI**: `docker exec -it scraptpress-redis redis-cli`

## ❓ Preguntas

Si tienes dudas sobre el proyecto o cómo contribuir:

1. Revisar la [documentación](docs/)
2. Buscar en issues existentes
3. Crear un nuevo issue con tu pregunta

## 📜 Licencia

Al contribuir, aceptas que tu código estará bajo la misma licencia del proyecto (ISC).
