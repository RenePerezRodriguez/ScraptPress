# Base Playwright con Chromium y dependencias ya listas
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

# Carpeta de trabajo
WORKDIR /app

# Copiar solo los manifests primero para cache de dependencias
COPY package*.json ./

# Instalar dependencias (incluye playwright en deps)
# Nota: mantenemos devDependencies para poder compilar TypeScript dentro del contenedor
RUN npm ci

# Copiar el resto del código
COPY . .

# Compilar TypeScript
RUN npm run build

# (Opcional) asegurar que Chromium está disponible según la versión del paquete
# La imagen base ya trae los navegadores, pero si el postinstall no corrió en cache:
RUN npx playwright install chromium --with-deps || true

# Variables por defecto para Cloud Run
ENV NODE_ENV=production
ENV PORT=8080

# Exponer el puerto HTTP usado por Cloud Run
EXPOSE 8080

# Comando de inicio
CMD ["npm", "start"]
