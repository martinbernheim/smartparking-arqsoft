# Contexto de build: raíz del repo (necesita el workspace contracts).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY contracts/package.json contracts/
COPY identity-service/package.json identity-service/
RUN npm ci
COPY contracts contracts
COPY identity-service identity-service
RUN npm run build -w contracts && npm run build -w identity-service
RUN npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/contracts/package.json contracts/package.json
COPY --from=build /app/contracts/dist contracts/dist
COPY --from=build /app/identity-service/package.json identity-service/package.json
COPY --from=build /app/identity-service/dist identity-service/dist
USER node
EXPOSE 3001
CMD ["node", "identity-service/dist/server.js"]
