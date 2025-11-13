# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in ScraptPress, please report it by:

1. **DO NOT** open a public GitHub issue
2. Email the details to the repository owner
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to expect

- **Response time**: Within 48 hours
- **Fix timeline**: Critical issues will be addressed within 7 days
- **Disclosure**: Coordinated disclosure after fix is deployed

## Security Best Practices

When deploying ScraptPress:

### 1. Environment Variables
- Never commit `.env` files
- Use strong, random API keys (minimum 32 characters)
- Rotate credentials regularly

### 2. Firebase Service Account
- Store service account JSON files securely
- Use restricted IAM permissions
- Enable audit logging

### 3. API Security
- Always require authentication (`API_KEY` header)
- Configure CORS with specific origins (not `*`)
- Use HTTPS in production
- Implement rate limiting

### 4. Dependencies
- Run `npm audit` regularly
- Update dependencies monthly
- Monitor Dependabot alerts

### 5. Production Deployment
- Use Cloud Run with IAM authentication
- Enable Cloud Armor for DDoS protection
- Configure proper security headers (Helmet)
- Monitor with Sentry

## Known Security Measures

ScraptPress implements:

- ✅ API Key authentication with timing-safe comparison
- ✅ CORS protection
- ✅ Security headers via Helmet
- ✅ Input validation with Zod schemas
- ✅ Rate limiting with Redis
- ✅ Error sanitization (no stack traces to clients)
- ✅ Sentry error tracking
- ✅ GDPR compliance endpoints

## Secure Configuration Example

```env
# Use cryptographically secure random keys
API_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ADMIN_TOKEN=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# Restrict CORS to your domains only
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Use production Sentry DSN
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Secure Firebase service account path
FIREBASE_SERVICE_ACCOUNT_PATH=./path/to/secure/firebase-key.json
```

## Vulnerability Disclosure History

No vulnerabilities have been reported or disclosed at this time.

---

**Last Updated**: 12 de noviembre de 2025  
**Security Contact**: Repository owner
