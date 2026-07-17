# Vivia Chat Service — imagen de producción (NestJS + ws puro, sin Socket.io)
#
# Una sola imagen sirve para dos comandos distintos en el deploy:
#   - Correr la app:        node dist/main
#   - Correr migraciones:   npm run migration:run   (usa ts-node contra
#     src/data-source.ts — por eso la imagen final conserva devDependencies
#     y el código fuente, no solo el dist compilado).

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Imagen final ---------------------------------------------------------
FROM node:22-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY --from=build /app/dist ./dist
COPY src ./src
COPY tsconfig.json tsconfig.build.json ./

RUN chown -R node:node /app
USER node

EXPOSE 3001

CMD ["node", "dist/main"]
