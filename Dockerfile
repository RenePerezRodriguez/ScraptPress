# Imagen base Playwright con Chromium optimizada para Cloud Run
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

# Carpeta de trabajo
WORKDIR /app

# Copiar manifests para aprovechamiento de cache de Docker
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias de producción + TypeScript compiler
# Nota: Necesitamos devDependencies para compilar TS dentro del contenedor
RUN npm ci --include=dev

# Copiar código fuente
COPY . .

# Compilar TypeScript a JavaScript
RUN npm run build

# Verificar que Chromium esté instalado (ya viene en imagen base)
RUN npx playwright install chromium --with-deps || true

# Limpiar devDependencies para reducir tamaño (opcional)
# RUN npm prune --production

# Variables de entorno para Cloud Run
ENV NODE_ENV=production
ENV PORT=8080
ENV HEADLESS=true
ENV BROWSER_TIMEOUT=60000

# Exponer puerto usado por Cloud Run
EXPOSE 8080

# Usuario no-root para seguridad (Cloud Run lo recomienda)
USER pwuser

# Health check (opcional pero recomendado)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });"

# Comando de inicio
CMD ["npm", "start"]
