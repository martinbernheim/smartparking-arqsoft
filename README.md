# SmartParking – Arquitectura de Software

Este repositorio contiene el diseño arquitectónico y la implementación del sistema SmartParking, desarrollado para la evaluación grupal de la asignatura: diagrama UML de componentes, escenarios de calidad y el registro de decisión arquitectónica ADR-01, con sus justificaciones. Primero se cierra el diseño y luego se implementa siguiendo esas decisiones.

## Contenido

- `docs/PLAN_SmartParking.md`: decisiones de diseño y sus justificaciones.
- `docs/diagramas/`: diagramas de componentes en PlantUML (`.puml`) y su exportación en PNG.

- `docs/SmartParking_Parte1.md` / `.pdf`: documento de diseño (A1–A4).
- `docs/PLAN_Implementacion.md`: plan de implementación por hitos.


## Cómo ejecutar

Prerrequisitos: Node 22, Docker + Compose v2, OpenSSL (en Windows usar Git Bash para los scripts `.sh`).

```bash
bash scripts/generate-keys.sh          # genera keys/private.pem y keys/public.pem (RS256)
cp .env.example .env                   # credenciales demo: admin@smartparking.local / Admin123!
docker compose up -d --build           # levanta la infraestructura y los servicios disponibles
```

Perfiles opcionales: `--profile observability` (Kibana, :5601) y `--profile replica` (réplica PostgreSQL).

Todo el acceso de clientes pasa por Nginx en **http://localhost:8080**:

| Ruta | Destino |
|---|---|
| `/auth/*`, `/.well-known/*` | Identity Service (`POST /auth/login`, JWKS) |
| `/api/*` | API, 2 réplicas balanceadas (Swagger UI en `/api/docs`) |
| `/` | SPA `web` (502 hasta que ese servicio exista) |

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
- Pruebas de carga: ver `load-tests/README.md` (k6, 500 req/s).
Límite conocido: si falla el alta del Cliente después de crear el usuario en Identity, el usuario queda huérfano
(se registra con `INCONSISTENCIA` en el log; la compensación automática no está implementada).
Eliminar un Cliente/Vehículo borra también sus reservas CANCELADAS (las ACTIVAS lo impiden con 409); el usuario de
Identity del cliente eliminado no se borra (Identity no expone baja de usuarios).

Los ids de los clientes demo son fijos (`SEED_CLIENT1_ID`, `SEED_CLIENT2_ID` en `.env.example`).

Pruebas y build locales:

```bash
npm install
npm run build
npm test
# Opcional: prueba de la constraint EXCLUDE contra Postgres real (docker compose up -d postgres + migraciones aplicadas)
RUN_DB_TESTS=1 DATABASE_URL=postgresql://smartparking:smartparking@localhost:5432/smartparking npm test -w api
```
