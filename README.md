# 🚗 ScraptPress v3.2 - Copart Vehicle Scraper API

> **API REST profesional con Smart API Interception, Cacheo Híbrido (Redis+Firestore), y Sincronización en Tiempo Real**

[![Version](https://img.shields.io/badge/version-3.2.0-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-20+-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-blue.svg)](https://www.typescriptlang.org)

---

## ✨ **Características v3.2**

### ⚡ **Smart API Interception (Nuevo Strategy)**
- 🕵️‍♂️ **No más HTML Parsing**: Interceptamos directamente el tráfico JSON de la API interna de Copart.
- 🎯 **100% Precisión**: Datos crudos exactos del servidor (VIN, Bid, Status, Fechas).
- 🚀 **Velocidad Extrema**: De ~20s a **2-3s** por búsqueda en vivo.
- 🛡️ **Anti-Detección Avanzada**: Simula navegación humana real para activar la API interna.

### 🧠 **Cacheo Híbrido Multi-Nivel**
1.  **L1 Redis Cache (Memoria)**:
    *   Respuestas en **< 30ms**.
    *   TTL configurable (default: 1 hora).
    *   Soporte completo de paginación.
2.  **L2 Firestore Cache (Persistencia)**:
    *   Almacenamiento histórico de 7 días.
    *   Sincronización automática en background.

### 🔄 **Live Sync & Persistence**
- **Auto-Sync**: Cada búsqueda "en vivo" guarda automáticamente los vehículos en la colección `copart_vehicles`.
- **Prefetching**: Predice y carga la siguiente página en segundo plano mientras el usuario ve la actual.

### 🚀 **Core Features**
- 🔍 **Búsqueda Avanzada**: Soporta queries complejos, filtros y paginación rápida.
- ⚡ **Workers Asíncronos**: Arquitectura de colas para scraping masivo sin bloquear la API.
- 🔒 **Rate Limiting**: Protección inteligente por IP y API Key.
- 📸 **Galería HD**: Extracción de URLs de alta resolución sin descargar imágenes.

---

## 🏗️ **Arquitectura v3.2**

```mermaid
graph TD
    Client[Cliente] -->|GET /api/search| API[API Gateway]
    
    API -->|1. Check L1| Redis[(Redis L1 Cache)]
    Redis -->|Hit (<30ms)| Client
    
    Redis -->|Miss| API
    API -->|2. Check L2| Firestore[(Firestore L2 Cache)]
    Firestore -->|Hit (~500ms)| Redis
    
    Firestore -->|Miss| Scraper[Browser Scraper]
    
    subgraph "Smart Scraping Strategy"
        Scraper -->|A. Navigate| Copart[Copart Lot Page]
        Scraper -->|B. Intercept| InternalAPI[Internal Search API]
        InternalAPI -->|JSON Data| Scraper
    end
    
    Scraper -->|3. Sync Data| VehiclesColl[(Firestore 'copart_vehicles')]
    Scraper -->|4. Populate| Redis
    Scraper -->|5. Return| Client
```

---

## ⚡ **Rendimiento v3.2**

| Métrica | v3.0 (AI/DOM) | v3.2 (API Interception) | Mejora |
| :--- | :--- | :--- | :--- |
| **Tiempo Scraping (10 items)** | ~140s | **~18s** | ⚡ 7x Más Rápido |
| **Tiempo Cache L1 (Redis)** | N/A | **31 ms** | 🚀 Instantáneo |
| **Precisión de Datos** | ~85% (OCR/AI) | **100%** (JSON Real) | ✅ Perfecta |
| **Costo por Búsqueda** | $0.004 (AI) | **$0.00** | 💰 Gratis |

---

## 🚀 **Quick Start**

### **1. Instalación**
```bash
git clone https://github.com/RenePerezRodriguez/ScraptPress.git
cd ScraptPress
npm install
```

### **2. Configuración (.env)**
```bash
cp .env.example .env
```
Asegúrate de configurar:
- `REDIS_HOST` / `REDIS_PORT` (Redis local o remoto)
- `GOOGLE_APPLICATION_CREDENTIALS` (Ruta a tu JSON de servicio)
- `API_KEY` (Para proteger tus endpoints)

### **3. Ejecución**
```bash
# Desarrollo (Auto-reload)
npm run dev

# Producción
npm run build
npm start
```

### **4. Verificación**
Puedes correr el script de simulación de producción para validar todo el flujo:
```bash
npx ts-node scripts/verify-prod-simulation.ts
```

---

## 📦 **Deployment**

### **Cloud Run**
El proyecto está optimizado para Google Cloud Run.
```bash
# Deploy completo
npm run deploy:full
```

### **Docker**
```bash
docker build -t scraptpress .
docker run -p 3000:3000 --env-file .env scraptpress
```

---

## 📋 **API Endpoints Principales**

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/search/vehicles` | Búsqueda principal (soporta `query`, `page`, `limit`) |
| `GET` | `/api/vehicle/:lotNumber` | Detalles de un vehículo específico |
| `GET` | `/api/health` | Estado del sistema y métricas |
| `GET` | `/api/search/status/:batchId` | Estado de trabajos asíncronos |

---

## 🤝 **Contribuir**

Ver [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 📄 **Licencia**

[ISC License](./LICENSE) - © 2025 Rene Perez Rodriguez
