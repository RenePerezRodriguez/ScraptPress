# 📚 Documentación - ScraptPress

> Scraper profesional de Copart.com con Firebase Firestore y anti-detección de bots.

---

## 📂 Estructura

```
docs/
├── api/                             # 📡 Recursos de la API
│   └── ejemplo-respuesta-optimizada.json
│
├── setup/                           # ⚙️ Configuración
│   └── FIRESTORE-INDEXES.md
│
├── deployment/                      # 🚀 Despliegue
│   └── CI-CD-SETUP.md
│
└── architecture/                    # 🏗️ Arquitectura
    └── ADD_NEW_PLATFORM.md
```

---

## 📖 Documentación Disponible

### ⚙️ Configuración

- **[FIRESTORE-INDEXES.md](setup/FIRESTORE-INDEXES.md)** - Configuración de índices de Firestore

### 🚀 Despliegue

- **[CI-CD-SETUP.md](deployment/CI-CD-SETUP.md)** - Configuración de CI/CD con GitHub Actions

### 🏗️ Arquitectura

- **[ADD_NEW_PLATFORM.md](architecture/ADD_NEW_PLATFORM.md)** - Guía para agregar nuevas plataformas de scraping

### 📦 Recursos

- **[ejemplo-respuesta-optimizada.json](api/ejemplo-respuesta-optimizada.json)** - Ejemplo de respuesta de la API

---

## 🚀 Inicio Rápido

Para comenzar con el proyecto, consulta el **[README.md principal](../README.md)** que incluye:

- ✅ Instalación y configuración
- ✅ Variables de entorno
- ✅ Comandos disponibles
- ✅ Uso de la API
- ✅ Stack tecnológico

Para contribuir al proyecto, revisa **[CONTRIBUTING.md](../CONTRIBUTING.md)**.

---

## 🔧 Configuración Esencial

### Firebase

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com)
2. Habilitar Firestore Database
3. Generar service account key (JSON)
4. Configurar `FIREBASE_SERVICE_ACCOUNT_PATH` en `.env`
5. Desplegar índices: `firebase deploy --only firestore:indexes`

Detalles: [setup/FIRESTORE-INDEXES.md](setup/FIRESTORE-INDEXES.md)

### Redis (Local)

```bash
docker compose -f docker-compose.redis.yml up -d
```

### Variables de Entorno

Copia `.env.example` a `.env` y configura:
- Firebase service account path
- API keys
- Sentry DSN
- Redis URL
- CORS origins

---

**Última actualización**: 12 de noviembre de 2025  
**Versión**: 1.1.0
