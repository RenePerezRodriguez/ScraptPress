# Firestore Indexes Configuration

Este archivo define los índices compuestos necesarios para optimizar las queries de Firestore.

## 📊 Índices Configurados

### 1. **copart_vehicles - Búsqueda por marca/modelo/año**
```
make (ASC) → model (ASC) → year (DESC)
```
- Optimiza: Búsquedas de vehículos específicos ordenados por año más reciente
- Ejemplo: "Toyota Camry 2024, 2023, 2022..."

### 2. **copart_vehicles - Marca con fecha de actualización**
```
make (ASC) → updated_at (DESC)
```
- Optimiza: Listado de vehículos por marca ordenados por más recientes
- Ejemplo: "Todos los Toyota, más recientes primero"

### 3. **copart_vehicles - Estado de venta con fecha**
```
sale_status (ASC) → updated_at (DESC)
```
- Optimiza: Filtrar por estado (upcoming, sold, etc.) ordenados por fecha
- Ejemplo: "Vehículos con estado 'On Approval' más recientes"

### 4. **search_history - Búsquedas exitosas**
```
created_at (DESC) → success (ASC)
```
- Optimiza: Análisis de búsquedas recientes y su tasa de éxito
- Ejemplo: "Últimas 100 búsquedas exitosas"

### 5. **api_requests - Requests por status code**
```
created_at (DESC) → status_code (ASC)
```
- Optimiza: Monitoreo de errores y performance por período
- Ejemplo: "Requests con error 500 en las últimas 24 horas"

## 🚀 Deployment de Índices

### Opción 1: Firebase CLI (Recomendado)
```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Inicializar proyecto (si no está inicializado)
firebase init firestore

# Desplegar índices
firebase deploy --only firestore:indexes
```

### Opción 2: Manual en Firebase Console
1. Ir a Firebase Console → Firestore Database
2. Pestaña "Indexes"
3. Click "Create Index"
4. Copiar configuración de `firestore.indexes.json`

## ⚠️ Notas Importantes

- Los índices tardan varios minutos en construirse
- Firestore creará automáticamente índices cuando intentes queries que los requieran
- Este archivo previene errores en producción al tener los índices pre-configurados
- No elimines índices sin verificar que no se usan en queries

## 📖 Referencias

- [Firestore Indexes Documentation](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Index Best Practices](https://firebase.google.com/docs/firestore/query-data/index-overview)
