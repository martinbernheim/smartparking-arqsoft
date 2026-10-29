# SmartParking – Arquitectura de Software

Diseño arquitectónico e implementación completa del sistema SmartParking (evaluación grupal de Arquitectura de Software): Identity propio con JWT RS256, API de clientes, vehículos y reservas, auditoría por eventos (RabbitMQ pub/sub + Elasticsearch), modelo de lectura CQRS, caché Redis, Nginx con 2 réplicas y SPA en React.

> **Empezá por acá:** [docs/GUIA_DE_USO.md](docs/GUIA_DE_USO.md) (cómo levantar y usar todo) · [docs/DEMO.md](docs/DEMO.md) (guion de presentación) · [docs/adr/ADR-00-indice.md](docs/adr/ADR-00-indice.md) (decisiones de arquitectura)

## Contenido

| Carpeta / archivo | Qué es |
|---|---|
| `identity-service/` | Autenticación propia: login, emisión de JWT RS256, JWKS, alta de usuarios (MongoDB) |
| `api/` | API de negocio: Clientes, Vehículos, Reservas (PostgreSQL + Prisma, Redis, publicación de eventos) |
| `audit-service/` | Suscriptor de eventos → log de auditoría independiente en Elasticsearch |
| `read-model-service/` | Suscriptor de eventos → modelo de lectura CQRS en MongoDB (`/consultas/`) |
| `web/` | SPA React + Vite + TypeScript |
| `nginx/` | Punto de entrada único y balanceo de las réplicas de la API |
| `contracts/` | DTOs compartidos (zod) y routing keys de eventos |
| `load-tests/` | Prueba de carga k6 (Escenario 1) |
| `docs/` | Entrega de diseño (PDF), ADRs, diagramas, diseño visual, guía de uso y demo |

## Cómo ejecutar

Prerrequisitos: Node 22, Docker + Compose v2, OpenSSL (en Windows usar Git Bash para los scripts `.sh`).

```bash
bash scripts/generate-keys.sh          # genera keys/private.pem y keys/public.pem (RS256)
cp .env.example .env                   # credenciales demo: admin@smartparking.local / Admin123!
docker compose up -d --build           # levanta toda la plataforma (Elasticsearch tarda ~1 min en quedar healthy)
```

Perfiles opcionales: `--profile observability` (Kibana, http://localhost:5601) y `--profile replica` (réplica PostgreSQL).

### Arquitectura y servicios

| Servicio | Rol | Acceso |
|---|---|---|
| `nginx` | Punto de entrada único y balanceador | http://localhost:8080 |
| `web` | SPA React + Vite (Nginx interno) | http://localhost:8080/ |
| `identity-service` | Login y JWT RS256 (MongoDB, base `identity`) | `/auth/*`, `/.well-known/*` (dev: :3001) |
| `api` (x2) | Lado COMANDO: CRUD de Clientes, Vehículos y Reservas (PostgreSQL, Redis); publica eventos | `/api/*`, Swagger en http://localhost:8080/api/docs |
| `api-migrate` | One-shot: migraciones Prisma + seed | - |
| `audit-service` | Suscriptor `audit-log` (`#`) -> Elasticsearch `audit-events` | dev: http://localhost:3003/audit/events |
| `read-model-service` | Lado QUERY (CQRS): suscriptor `read-model.reservas` -> MongoDB `smartparking_read` | `/consultas/*` |
| `rabbitmq` | Exchange topic `smartparking.events` | UI http://localhost:15672 (guest/guest) |
| `elasticsearch` | Almacén de auditoría (single-node, sin seguridad) | http://localhost:9200 |
| `kibana` (perfil `observability`) | Exploración de auditoría | http://localhost:5601 |
| `postgres`, `redis`, `mongo` | Persistencia, caché y base de Identity / modelo de lectura | puertos de dev 5432, 6379, 27017 |

Flujo de eventos: la API publica cada cambio (con `datos`, snapshot de la entidad) en `smartparking.events`; Audit y el modelo de
lectura reciben cada uno su copia en su propia cola (Pub/Sub). Ver `read-model-service/README.md` y `audit-service/README.md`.

Todo el acceso de clientes pasa por Nginx en **http://localhost:8080**:

| Ruta | Destino |
|---|---|
| `/auth/*`, `/.well-known/*` | Identity Service (`POST /auth/login`, JWKS) |
| `/api/*` | API, 2 réplicas balanceadas (Swagger UI en `/api/docs`) |
| `/consultas/*` | Read Model Service (CQRS): `GET /consultas/clientes/:id/resumen`, `GET /consultas/ranking?limit=` |
| `/` | SPA `web` |

El puerto 3001 de Identity sigue publicado solo para desarrollo; la API no publica puerto (2 réplicas, solo vía Nginx).
Al levantar, el servicio one-shot `api-migrate` aplica las migraciones y el seed idempotente (clientes demo, vehículos
y reservas de 2026) antes de arrancar las réplicas de `api`. Flujo rápido:

```bash
TOKEN=$(curl -s localhost:8080/auth/login -H 'content-type: application/json' -d '{"email":"cliente1@smartparking.local","password":"Cliente123!"}' | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
curl -si localhost:8080/api/reservas/mias -H "Authorization: Bearer $TOKEN" | grep -iE '^HTTP|x-cache|x-upstream-instance'
```

- `X-Cache: HIT|MISS` en `GET /api/reservas/mias` y `GET /api/admin/reservas` (Redis, TTL `CACHE_TTL_SECONDS`=30 s;
  cualquier alta/modificación/cancelación de reserva invalida). Si Redis cae, la API responde igual desde la BD.
- `X-Upstream-Instance` alterna entre las 2 réplicas de la API (balanceo round-robin por DNS de Docker).
- Auditoría: `AUDIT_PUBLISHER=rabbitmq` publica en el exchange topic `smartparking.events` (routing keys
  `reserva.creada`, `reserva.cancelada`, `cliente.creado`, ...; UI de RabbitMQ en http://localhost:15672, guest/guest).
  Si RabbitMQ no responde tras 3 reintentos, la petición HTTP igual tiene éxito y se loguea `AUDIT_PUBLISH_FAILED`.
  Con `AUDIT_PUBLISHER=log` los eventos solo se escriben en el log (`AUDIT_EVENT`).
- CQRS: los comandos escriben en PostgreSQL y emiten el evento; el modelo de lectura (`smartparking_read` en Mongo, vista
  derivada y reconstruible, no fuente de verdad) se actualiza de forma asíncrona. Arranca vacío: se completa a medida que
  llegan eventos (crear una reserva ya lo puebla). La SPA (admin, Reservas) muestra un ranking que consume `/consultas/ranking`.
- Pruebas de carga: ver `load-tests/README.md` (k6, 500 req/s).
Límite conocido: si falla el alta del Cliente después de crear el usuario en Identity, el usuario queda huérfano
(se registra con `INCONSISTENCIA` en el log; la compensación automática no está implementada).
Eliminar un Cliente/Vehículo borra también sus reservas CANCELADAS (las ACTIVAS lo impiden con 409); el usuario de
Identity del cliente eliminado no se borra (Identity no expone baja de usuarios).

Los ids de los clientes demo son fijos (`SEED_CLIENT1_ID`, `SEED_CLIENT2_ID` en `.env.example`).

### Demo rápida

1. Abrir http://localhost:8080 e ingresar como `cliente1@smartparking.local` / `Cliente123!` (o `cliente2@...`); admin: `admin@smartparking.local` / `Admin123!`.
2. Crear una reserva (o por API con el flujo de arriba).
3. Auditoría: `curl "localhost:3003/audit/events?entidad=Reserva"` (o Kibana con el perfil `observability`).
4. Modelo de lectura (con token de admin): `curl localhost:8080/consultas/ranking -H "Authorization: Bearer $ADMIN_TOKEN"` y
   `curl localhost:8080/consultas/clientes/<clienteId>/resumen -H "Authorization: Bearer $ADMIN_TOKEN"`.
5. RabbitMQ (http://localhost:15672, Queues): `audit-log` y `read-model.reservas`, cada una con sus DLQ.

### Pruebas, build y carga

Tests con Vitest en `identity-service`, `api`, `audit-service` y `read-model-service`; el frontend se construye aparte
(`cd web && npm ci && npm run build`; `npm run dev` con `VITE_MOCK=1` para trabajar sin backend).
Carga con k6: `load-tests/README.md`.

```bash
npm install
npm run build
npm test
# Opcional: prueba de la constraint EXCLUDE contra Postgres real (docker compose up -d postgres + migraciones aplicadas)
RUN_DB_TESTS=1 DATABASE_URL=postgresql://smartparking:smartparking@localhost:5432/smartparking npm test -w api
```
