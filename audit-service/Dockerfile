# Contexto de build: raíz del repo (necesita el workspace contracts).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY contracts/package.json contracts/
COPY audit-service/package.json audit-service/
RUN npm ci
COPY contracts contracts
COPY audit-service audit-service
RUN npm run build -w contracts && npm run build -w audit-service
RUN npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/contracts/package.json contracts/package.json
COPY --from=build /app/contracts/dist contracts/dist
COPY --from=build /app/audit-service/package.json audit-service/package.json
COPY --from=build /app/audit-service/dist audit-service/dist
USER node
EXPOSE 3003
CMD ["node", "audit-service/dist/server.js"]
