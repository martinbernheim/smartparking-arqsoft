# Contexto de build: raíz del repo (necesita el workspace contracts).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY contracts/package.json contracts/
COPY read-model-service/package.json read-model-service/
RUN npm ci
COPY contracts contracts
COPY read-model-service read-model-service
RUN npm run build -w contracts && npm run build -w read-model-service
RUN npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/contracts/package.json contracts/package.json
COPY --from=build /app/contracts/dist contracts/dist
COPY --from=build /app/read-model-service/package.json read-model-service/package.json
COPY --from=build /app/read-model-service/dist read-model-service/dist
USER node
EXPOSE 3004
CMD ["node", "read-model-service/dist/server.js"]
