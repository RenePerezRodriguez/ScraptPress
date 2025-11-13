# Agregar Nueva Plataforma de Scraping

Esta guía explica cómo extender ScraptPress para soportar nuevas plataformas de subastas de vehículos (ej: IAAI, Manheim).

## 🏗️ Arquitectura de Plataformas

El sistema está diseñado con un patrón de fábrica que permite agregar nuevas plataformas sin modificar el código existente.

```
src/services/scrapers/platforms/
├── base.platform.ts          # Clase abstracta base
├── platform.factory.ts       # Registro de plataformas
└── copart/                   # Implementación de ejemplo
    ├── copart.platform.ts
    ├── extractors/           # Extracción de datos
    └── transformers/         # Transformación a formato común
```

## 📋 Pasos para Agregar Nueva Plataforma

### 1. Crear Estructura de Carpetas

```bash
mkdir -p src/services/scrapers/platforms/iaai/extractors
mkdir -p src/services/scrapers/platforms/iaai/transformers
```

### 2. Crear Clase Principal

Crear `src/services/scrapers/platforms/iaai/iaai.platform.ts`:

```typescript
import { BasePlatform } from '../base.platform';
import { VehicleData } from '../../../../types/vehicle.types';

export class IaaiPlatform extends BasePlatform {
  protected baseUrl = 'https://www.iaai.com';
  
  async searchVehicles(params: SearchParams): Promise<VehicleData[]> {
    // 1. Navegar a página de búsqueda
    // 2. Interceptar API responses
    // 3. Extraer datos
    // 4. Transformar a formato común
  }
  
  protected getSearchUrl(params: SearchParams): string {
    // Construir URL de búsqueda específica de IAAI
  }
}
```

### 3. Implementar Extractores

Los extractores son responsables de obtener datos específicos de la página:

**`extractors/details.extractor.ts`**:
```typescript
export class DetailsExtractor {
  static async extract(page: Page): Promise<VehicleDetails> {
    // Selectores CSS específicos de IAAI
    const details = await page.evaluate(() => {
      return {
        odometer: document.querySelector('.odometer')?.textContent,
        damage: document.querySelector('.damage-type')?.textContent,
        // ... más campos
      };
    });
    return details;
  }
}
```

### 4. Implementar Transformadores

Los transformadores convierten datos de la plataforma al formato común:

**`transformers/vehicle.transformer.ts`**:
```typescript
export class VehicleTransformer {
  static transform(rawData: any): VehicleData {
    return {
      lot_number: rawData.stockNumber,
      make: rawData.manufacturer,
      model: rawData.vehicleModel,
      year: parseInt(rawData.modelYear),
      vin: rawData.vinNumber,
      // ... mapear todos los campos
    };
  }
}
```

### 5. Registrar en Factory

Editar `src/services/scrapers/platforms/platform.factory.ts`:

```typescript
import { IaaiPlatform } from './iaai/iaai.platform';

export class PlatformFactory {
  private platforms: Map<string, PlatformConfig> = new Map([
    ['copart', {
      config: { name: 'Copart', baseUrl: 'https://www.copart.com' },
      factory: () => new CopartPlatform()
    }],
    ['iaai', {
      config: { name: 'IAAI', baseUrl: 'https://www.iaai.com' },
      factory: () => new IaaiPlatform()
    }]
  ]);
}
```

### 6. Agregar Ruta de API

Crear o actualizar `src/api/routes/scraper.routes.ts`:

```typescript
router.post('/iaai-search', 
  authenticateApiKey,
  validateSearchRequest,
  asyncHandler(scraperController.searchIaai)
);
```

### 7. Testing

Crear tests unitarios en `tests/unit/scrapers/iaai.platform.test.ts`:

```typescript
describe('IaaiPlatform', () => {
  it('should search vehicles successfully', async () => {
    const platform = new IaaiPlatform();
    const results = await platform.searchVehicles({
      query: 'toyota camry',
      count: 5
    });
    expect(results).toHaveLength(5);
  });
});
```

## ✅ Checklist de Implementación

- [ ] Crear estructura de carpetas
- [ ] Implementar clase principal extendiendo `BasePlatform`
- [ ] Crear extractores (details, images, vin)
- [ ] Crear transformadores (vehicle.transformer)
- [ ] Registrar plataforma en `PlatformFactory`
- [ ] Agregar ruta de API
- [ ] Escribir tests unitarios
- [ ] Documentar endpoints específicos
- [ ] Probar en desarrollo
- [ ] Probar en producción

## 🔍 Consideraciones Importantes

### Anti-Bot Detection

Cada plataforma puede usar diferentes medidas anti-bot:
- Analizar requests con DevTools Network
- Identificar patrones de detección
- Adaptar user agents y headers
- Implementar delays si es necesario

### Formato de Datos

Mantener consistencia con `VehicleData` interface:
```typescript
interface VehicleData {
  lot_number: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  images: ImageGallery;
  // ... ver types/vehicle.types.ts
}
```

### Performance

- Implementar cache Redis para respuestas
- Usar estrategias de scraping eficientes
- Limitar requests concurrentes
- Implementar timeouts adecuados

## 📚 Recursos

- Código de referencia: `src/services/scrapers/platforms/copart/`
- Tipos base: `src/types/vehicle.types.ts`
- Testing: `tests/unit/scrapers/`
- Documentación de Playwright: https://playwright.dev

## 🆘 Soporte

Si tienes dudas durante la implementación:
1. Revisa la implementación existente de Copart
2. Consulta [CONTRIBUTING.md](../../CONTRIBUTING.md)
3. Abre un issue en GitHub
