# Contributing to ScraptPress

¡Gracias por tu interés en contribuir a ScraptPress! 🎉

## 📋 Tabla de Contenidos

- [Código de Conducta](#código-de-conducta)
- [Cómo Contribuir](#cómo-contribuir)
- [Reportar Bugs](#reportar-bugs)
- [Sugerir Mejoras](#sugerir-mejoras)
- [Pull Requests](#pull-requests)
- [Guía de Estilo](#guía-de-estilo)
- [Configuración de Desarrollo](#configuración-de-desarrollo)
- [Testing](#testing)

## 📜 Código de Conducta

Este proyecto sigue un código de conducta que todos los contribuyentes deben respetar:

- **Sé respetuoso**: Trata a todos con respeto y profesionalismo
- **Sé constructivo**: Las críticas deben ser constructivas
- **Sé colaborativo**: Trabaja en equipo y ayuda a otros
- **Sé paciente**: Recuerda que todos estamos aprendiendo

## 🤝 Cómo Contribuir

### 1. Fork el Repositorio

```bash
# Haz fork desde GitHub UI
# Luego clona tu fork
git clone https://github.com/TU-USUARIO/ScraptPress.git
cd ScraptPress
```

### 2. Crea una Rama

```bash
# Para nuevas features
git checkout -b feature/nombre-feature

# Para bugfixes
git checkout -b fix/descripcion-bug

# Para documentación
git checkout -b docs/descripcion-cambio
```

### 3. Haz tus Cambios

- Escribe código limpio y siguiendo la [Guía de Estilo](#guía-de-estilo)
- Añade tests para nuevo código
- Actualiza la documentación si es necesario
- Asegúrate de que todos los tests pasen

### 4. Commit

```bash
# Staging
git add .

# Commit con mensaje descriptivo
git commit -m "feat: descripción del cambio"
```

**Formato de commits** (Conventional Commits):
- `feat:` Nueva funcionalidad
- `fix:` Corrección de bug
- `docs:` Cambios en documentación
- `style:` Cambios de formato (no afectan lógica)
- `refactor:` Refactorización de código
- `test:` Añadir o modificar tests
- `chore:` Tareas de mantenimiento

### 5. Push y Pull Request

```bash
# Push a tu fork
git push origin feature/nombre-feature

# Luego crea Pull Request desde GitHub UI
```

## 🐛 Reportar Bugs

### Antes de Reportar

1. **Busca** en [Issues existentes](https://github.com/RenePerezRodriguez/ScraptPress/issues)
2. **Verifica** que estés usando la última versión
3. **Reproduce** el bug de forma consistente

### Template de Bug Report

```markdown
**Descripción del Bug**
Descripción clara y concisa del problema.

**Pasos para Reproducir**
1. Ir a '...'
2. Hacer click en '...'
3. Ver error

**Comportamiento Esperado**
Lo que debería suceder.

**Comportamiento Actual**
Lo que realmente sucede.

**Screenshots**
Si aplica, añade screenshots.

**Entorno**
- OS: [e.g. Windows 11]
- Node: [e.g. 20.10.0]
- Versión: [e.g. 1.1.0]

**Información Adicional**
Contexto adicional del problema.
```

## 💡 Sugerir Mejoras

### Template de Feature Request

```markdown
**¿El feature está relacionado a un problema?**
Descripción clara del problema. Ej: "Siempre me frustra cuando [...]"

**Describe la Solución que Te Gustaría**
Descripción clara de lo que quieres que suceda.

**Describe Alternativas Consideradas**
Otras soluciones o features consideradas.

**Contexto Adicional**
Añade cualquier otro contexto o screenshots.
```

## 🔄 Pull Requests

### Checklist Antes de Enviar

- [ ] El código sigue la [Guía de Estilo](#guía-de-estilo)
- [ ] He comentado mi código, especialmente en áreas difíciles
- [ ] He actualizado la documentación correspondiente
- [ ] Mis cambios no generan nuevas warnings
- [ ] He añadido tests que prueban que mi fix es efectivo o que mi feature funciona
- [ ] Tests nuevos y existentes pasan localmente
- [ ] He hecho commits siguiendo Conventional Commits
- [ ] He actualizado el CHANGELOG.md (si aplica)

### Process de Review

1. Un maintainer revisará tu PR dentro de 48-72 horas
2. Pueden solicitar cambios o hacer preguntas
3. Una vez aprobado, se hará merge a `main`
4. Tu contribución aparecerá en el siguiente release

## 📝 Guía de Estilo

### TypeScript

```typescript
// ✅ BUENO
export interface VehicleData {
  lotNumber: string;
  vin: string;
  year: string;
  make: string;
}

// ❌ MALO
export interface vehicle_data {
  lot_number: string;
  VIN: string;
  Year: string;
  make: string;
}
```

### Nombres de Variables

- **camelCase** para variables y funciones: `vehicleData`, `fetchVehicles()`
- **PascalCase** para clases e interfaces: `VehicleRepository`, `CopartPlatform`
- **SCREAMING_SNAKE_CASE** para constantes: `MAX_ITEMS_PER_REQUEST`, `API_KEY`

### Comentarios

```typescript
/**
 * Extrae datos de vehículo desde página de Copart
 * @param page - Página de Playwright
 * @param lotNumber - Número de lote del vehículo
 * @returns Datos completos del vehículo
 */
async function extractVehicleData(page: Page, lotNumber: string): Promise<VehicleData> {
  // Comentarios inline para lógica compleja
  const vin = await extractVIN(page);
  
  return { lotNumber, vin, /* ... */ };
}
```

### Estructura de Archivos

```
src/
├── api/
│   ├── controllers/    # Lógica de negocio
│   ├── routes/         # Definición de rutas
│   ├── middleware/     # Middleware Express
│   └── utils/          # Utilidades
├── services/           # Servicios (scraping, cache, etc.)
├── config/             # Configuración (Firebase, Sentry, etc.)
└── types/              # Tipos TypeScript
```

### Import Order

```typescript
// 1. Node modules
import express from 'express';
import path from 'path';

// 2. Tipos
import { VehicleData } from '../types/vehicle.types';

// 3. Services
import { CopartPlatform } from '../services/scrapers/platforms/copart/copart.platform';

// 4. Utils
import { asyncHandler } from '../utils/asyncHandler';
```

### Error Handling

```typescript
// ✅ BUENO - Errores específicos
try {
  await scrapeVehicle(lotNumber);
} catch (error) {
  logger.error('SCRAPE', 'Error scraping vehicle', { 
    lotNumber, 
    error: error instanceof Error ? error.message : 'Unknown error' 
  });
  throw new Error(`Failed to scrape vehicle ${lotNumber}`);
}

// ❌ MALO - Error genérico
try {
  await scrapeVehicle(lotNumber);
} catch (error) {
  console.log('error', error);
  throw error;
}
```

### Logging

```typescript
// ✅ BUENO - Logger estructurado
logger.info('SEARCH', 'Nueva búsqueda iniciada', { query: 'toyota', page: 1 });
logger.success('BATCH', 'Batch completado', { size: 100, duration: 240 });
logger.warn('RATE-LIMIT', 'Rate limit detectado', { remaining: 0 });
logger.error('SCRAPE', 'Error en scraping', error);

// ❌ MALO - Console.log directo
console.log('search started');
console.log('done');
```

## 🔧 Configuración de Desarrollo

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Iniciar Redis (Docker)

```bash
docker compose -f docker-compose.redis.yml up -d
```

### 4. Configurar Firebase

1. Crear proyecto en Firebase Console
2. Descargar service account JSON
3. Colocar en `src/config/credentials/` (crear carpeta si no existe)
4. Actualizar `GOOGLE_APPLICATION_CREDENTIALS` en `.env` o confiar en el auto-discovery

### 5. Ejecutar en Desarrollo

```bash
npm run dev
```

### 6. Build

```bash
npm run build
```

## 🧪 Testing

### Ejecutar Tests

```bash
# Todos los tests
npm test

# Tests específicos
npm test -- vehicle.repository

# Con coverage
npm test -- --coverage
```

### Escribir Tests

```typescript
import { VehicleRepository } from '../vehicle.repository';

describe('VehicleRepository', () => {
  describe('upsertVehicle', () => {
    it('should insert new vehicle', async () => {
      const vehicle = {
        lot_number: '12345',
        vin: 'ABC123',
        // ...
      };
      
      await repo.upsertVehicle(vehicle);
      
      const retrieved = await repo.getVehicleByLot('12345');
      expect(retrieved).toMatchObject(vehicle);
    });
  });
});
```

### Coverage Goals

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

## 📚 Recursos Adicionales

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Conventional Commits](https://www.conventionalcommits.org/)

## 📞 Contacto

Si tienes preguntas sobre cómo contribuir:

1. Abre un [GitHub Issue](https://github.com/RenePerezRodriguez/ScraptPress/issues)
2. Revisa la [Documentación](docs/README.md)
3. Consulta el [README principal](README.md)

---

¡Gracias por contribuir a ScraptPress! 🚗💨
