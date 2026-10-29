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

Hasta que exista Nginx (H5) el Identity Service se consulta directo en `http://localhost:3001`
(`POST /auth/login`, `GET /.well-known/jwks.json`, `POST /users` solo ADMIN, `GET /health`).
La API (H2/H3) corre en `http://localhost:3002` (Swagger UI en `/api/docs`, health en `/health`). Al arrancar el
contenedor ejecuta `prisma migrate deploy`, el seed idempotente (clientes demo, vehículos y reservas de 2026) y el servidor.
Flujo rápido:

```bash
TOKEN=$(curl -s localhost:3001/auth/login -H 'content-type: application/json'   -d '{"email":"cliente1@smartparking.local","password":"Cliente123!"}' | sed 's/.*"accessToken":"\([^"]*\)".*//')
curl -s localhost:3002/api/reservas/mias -H "Authorization: Bearer $TOKEN"
```

Auditoría: hasta H4 los eventos se escriben en el log de la API (`AUDIT_PUBLISHER=log`, líneas `AUDIT_EVENT`).
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
