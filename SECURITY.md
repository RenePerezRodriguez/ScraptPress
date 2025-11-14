# Security Policy

## 🔒 Supported Versions

Versiones actualmente soportadas con actualizaciones de seguridad:

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | ✅ Sí              |
| 1.0.x   | ⚠️ Soporte limitado |
| < 1.0   | ❌ No              |

## 🛡️ Reporting a Vulnerability

Si descubres una vulnerabilidad de seguridad, por favor **NO** la reportes públicamente.

### Proceso de Reporte

1. **Email**: Envía los detalles a **[+591-63996379]** (o al maintainer principal)
2. **Subject**: `[SECURITY] Descripción breve`
3. **Contenido**: Incluye:
   - Descripción detallada de la vulnerabilidad
   - Pasos para reproducir
   - Impacto potencial
   - Sugerencias de fix (si las tienes)

### Timeline de Respuesta

- **24-48 horas**: Confirmación de recepción
- **7 días**: Evaluación inicial y severidad
- **30 días**: Fix y release (dependiendo de severidad)
- **Public disclosure**: Después del fix, con crédito al reporter (si lo desea)

## 🔐 Security Features

### Authentication & Authorization

```typescript
// ✅ API Key Authentication
router.use(authenticateApiKey);

// ✅ Admin Token para endpoints sensibles
router.delete('/vehicle/:lotNumber', authenticateAdmin, asyncHandler(deleteVehicle));
```

### Rate Limiting

```typescript
// ✅ Rate limiting por IP
const limiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minuto
  max: 60,                    // 60 requests
  standardHeaders: true,
  legacyHeaders: false,
});
```

### Input Validation

```typescript
// ✅ Validación con Zod
const searchSchema = z.object({
  query: z.string().min(1).max(100),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
});
```

### Security Headers

```typescript
// ✅ Helmet para headers de seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "https://cs.copart.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

### CORS Configuration

```typescript
// ✅ CORS restrictivo
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE'],
}));
```

## 🚨 Known Security Considerations

### 1. Service Account Keys

**⚠️ CRÍTICO**: Los archivos de service account de Firebase **NUNCA** deben ser commiteados.

```bash
# Ya incluido en .gitignore
*firebase-adminsdk*.json
*.serviceaccount.json
```

**Best practices**:
- Usar variables de entorno en producción
- Rotar keys periódicamente
- Usar IAM con permisos mínimos necesarios

### 2. API Keys

```env
# .env (NUNCA commitear)
API_KEY=tu-key-segura-aqui
ADMIN_TOKEN=tu-token-admin-seguro
```

**Generar keys seguras**:
```bash
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Error Handling

```typescript
// ✅ BUENO - No exponer detalles internos
catch (error) {
  logger.error('SCRAPE', 'Error scraping', { error });
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
}

// ❌ MALO - Expone stack traces
catch (error) {
  return res.status(500).json({ error: error.stack });
}
```

### 4. Secrets Management

**En desarrollo**:
- Usar `.env` local (no commitear)
- `.env.example` como template (sin valores reales)

**En producción**:
- Google Cloud Secret Manager
- Variables de entorno de Cloud Run
- Nunca hardcodear secrets

## 🔍 Security Audit Checklist

### Pre-Deploy

- [ ] Todas las dependencies actualizadas (`npm audit`)
- [ ] Service account keys no commiteados
- [ ] `.env` no commiteado
- [ ] API keys rotadas para producción
- [ ] CORS configurado para dominios específicos
- [ ] Rate limiting habilitado
- [ ] Helmet configurado
- [ ] Input validation en todos los endpoints
- [ ] Error handling sin exponer detalles internos
- [ ] HTTPS habilitado en producción
- [ ] Sentry error tracking configurado

### Regular Maintenance

- [ ] `npm audit` mensual
- [ ] Rotar API keys cada 90 días
- [ ] Revisar logs de Sentry semanalmente
- [ ] Actualizar dependencies críticas ASAP
- [ ] Revisar CORS origins trimestralmente
- [ ] Audit de IAM permissions semestralmente

## 🛠️ Security Tools

### NPM Audit

```bash
# Verificar vulnerabilidades
npm audit

# Fix automático (versiones menores)
npm audit fix

# Fix incluyendo breaking changes
npm audit fix --force
```

### Dependabot (GitHub)

Ya configurado para:
- Alertas automáticas de vulnerabilidades
- PRs automáticos con fixes
- Updates semanales de dependencies

### Sentry

```typescript
// Captura automática de errores
Sentry.captureException(error);

// Con contexto adicional
Sentry.captureException(error, {
  tags: { section: 'scraping' },
  extra: { lotNumber, query },
});
```

## 📋 Compliance

### GDPR

Endpoints implementados:
- `GET /api/gdpr/data/:identifier` - Data access request
- `DELETE /api/gdpr/delete/:identifier` - Right to be forgotten

### Data Retention

- **Vehicles**: 7 días en Firestore (TTL automático)
- **Cache Redis**: 1 hora
- **API Logs**: 30 días
- **Error Logs**: 90 días

### PII Handling

**Datos NO almacenados**:
- Información personal de compradores
- Datos de tarjetas de crédito
- Direcciones de usuarios

**Datos almacenados** (públicos en Copart):
- VIN de vehículos
- Información técnica de vehículos
- Precios y subastas públicas

## 🚀 Secure Deployment

### Cloud Run

```bash
# Deploy con configuración segura
gcloud run deploy scraptpress \
  --source . \
  --region=southamerica-east1 \
  --no-allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets API_KEY=api-key:latest,ADMIN_TOKEN=admin-token:latest
```

### Environment Variables

```bash
# Nunca usar
--set-env-vars API_KEY=plaintext-key

# ✅ Usar secrets
--set-secrets API_KEY=api-key:latest
```

## 📞 Security Contact

Para reportes de seguridad:

- **Email**: [Añadir email de seguridad]
- **PGP Key**: [Opcional - añadir fingerprint]
- **Response Time**: 24-48 horas

## 🔗 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Google Cloud Security](https://cloud.google.com/security)

---

**Última actualización**: 13 de noviembre de 2025  
**Security Version**: 1.1.0
