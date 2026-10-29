# Contexto de build: raíz del repo (necesita el workspace contracts).
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY contracts/package.json contracts/
COPY api/package.json api/
RUN npm ci
COPY contracts contracts
COPY api api
# build de api = prisma generate + tsc
RUN npm run build -w contracts && npm run build -w api
RUN npm prune --omit=dev
# prune puede eliminar el cliente generado: se regenera (la CLI de prisma es dependencia de runtime)
RUN node_modules/.bin/prisma generate --schema api/prisma/schema.prisma

FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/contracts/package.json contracts/package.json
COPY --from=build /app/contracts/dist contracts/dist
COPY --from=build /app/api/package.json api/package.json
COPY --from=build /app/api/prisma api/prisma
COPY --from=build /app/api/dist api/dist
WORKDIR /app/api
USER node
EXPOSE 3002
# Migraciones -> seed idempotente -> servidor
CMD ["sh", "-c", "../node_modules/.bin/prisma migrate deploy && node dist/seed/run-seed.js && node dist/server.js"]
