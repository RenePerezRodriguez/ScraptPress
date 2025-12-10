# ✅ Cloud Run Deployment Checklist v3.2

## Pre-requisitos

### 1. Google Cloud Platform
- [ ] Proyecto creado en GCP
- [ ] Billing habilitado
- [ ] Cloud Run API habilitada
- [ ] Secret Manager API habilitada
- [ ] Container Registry habilitado

### 2. Servicios Externos
- [ ] **Firebase**: Service account JSON descargado
- [ ] **Redis Labs**: Base de datos creada, URL de conexión obtenida
- [ ] **Sentry** (opcional): Proyecto creado, DSN obtenido

### 3. Secrets Management
```bash
# Firebase
gcloud secrets create firebase-service-account --data-file=./config/credentials/studio-*.json

# API Key
echo -n "tu-api-key-64-chars" | gcloud secrets create api-key --data-file=-

# Redis
echo -n "redis://..." | gcloud secrets create redis-url --data-file=-
```

---

## Deployment

### 1. Build Local
```bash
npm run build
npm start  # Verificar localmente
```

### 2. Deploy a Cloud Run
```bash
gcloud run deploy scraptpress \
  --source . \
  --region us-central1 \
  --min-instances 0 \
  --max-instances 10 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars "NODE_ENV=production,HEADLESS=true" \
  --update-secrets "API_KEY=api-key:latest" \
  --update-secrets "REDIS_URL=redis-url:latest" \
  --update-secrets "/secrets/firebase.json=firebase-service-account:latest"
```

---

## Post-Deployment

### 1. Verificar Health
```bash
curl https://your-service.run.app/api/health
```

### 2. Testing
```bash
curl -H "X-API-Key: YOUR_KEY" \
  "https://your-service.run.app/api/search/vehicles?query=toyota&limit=10"
```

---

## Troubleshooting

### Logs
```bash
gcloud run services logs tail scraptpress --region us-central1
```

### Rollback
```bash
gcloud run revisions list --service scraptpress --region us-central1
gcloud run services update-traffic scraptpress --to-revisions REVISION=100
```
