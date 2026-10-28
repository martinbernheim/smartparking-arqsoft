# SmartParking – Plan de implementación (BORRADOR)

> Estado: borrador para aprobar. Sin código todavía. El diseño (`SmartParking_Parte1.md` y `diagramas/*.puml`) es final: la implementación respeta los mismos nombres de componentes, interfaces y DTOs. Lo marcado **DECISIÓN ABIERTA** se resuelve en la sección 7.

---

## 1. Objetivo y alcance

Construir un prototipo ejecutable con `docker compose up` que demuestre el diseño: auth propia con JWT RS256, CRUD de Clientes/Vehículos/Reservas con regla de no solapamiento, auditoría asíncrona por RabbitMQ hacia Elasticsearch, caché Redis, Nginx con 2 réplicas de la API.

| Elemento | Prioridad | Notas |
|---|---|---|
| Identity Service + Identity DB (MongoDB) | MVP | login, JWKS, alta de usuario, seed ADMIN |
| SmartParking API + Operational DB (PostgreSQL) | MVP | RF1–RF5, EXCLUDE, 401/403/404/409/400 |
| RabbitMQ + Audit Log Service + Elasticsearch | MVP | publisher confirms + retry; consumer con ack tras escribir |
| Redis (CacheService) | MVP | TTL 30 s + invalidación |
| Nginx + 2 réplicas API | MVP | `/auth`, `/api` |
| Pruebas unitarias + integración + k6 | MVP | ver sección 6 |
| Read Replica PostgreSQL (streaming) | **Opcional** (profile `replica`) | Por defecto `ISqlReplica` apunta a la primaria (`DATABASE_REPLICA_URL` = primaria). El código ya separa los dos clientes. |
| Kibana | **Opcional** (profile `kibana`) | Solo consulta visual del audit trail; se puede consultar ES por curl. |
| Web Client | **Mínimo** | **DECISIÓN ABIERTA D1**: Swagger UI + colección Postman (recomendado) vs SPA mínima. |
| Refresh token, Outbox, rate limiting | Fuera de alcance | Mejoras futuras ya declaradas en el diseño. |

---

## 2. Estructura del repositorio (monorepo)

```
smartparking/
├── docker-compose.yml          # perfiles: default, replica, kibana
├── .env.example                # variables compartidas de compose
├── README.md                   # H7: cómo ejecutar
├── contracts/                  # DECISIÓN D3: tipos DTO compartidos (paquete local)
│   └── src/ {cliente.dto.ts, vehiculo.dto.ts, reserva.dto.ts, auth.dto.ts, evento-auditoria.dto.ts, user-admin.dto.ts}
├── identity-service/
├── api/
├── audit-service/
├── nginx/
│   └── nginx.conf
├── load-tests/
│   └── reservas-read.k6.js
├── postman/                    # si D1 = Postman
└── docs/                       # DECISIÓN D4: diseño (Parte1.md, diagramas/, PLAN_*.md)
```

Contratos compartidos (`contracts/`): paquete TypeScript local referenciado con npm workspaces (`"workspaces"` en `package.json` raíz) o copiado en cada servicio. Recomendado: workspaces, solo tipos/interfaces (sin lógica) para no acoplar despliegues.

---

## 3. Detalle por servicio

### 3.1 Identity Service (`identity-service/`) — puerto 3001

Libs: `express`, `jsonwebtoken`, `bcrypt`, `mongoose`, `dotenv`, `zod`(D2), `winston`, `swagger-jsdoc` + `swagger-ui-express` (opcional).

```
src/
├── app.ts, server.ts, config/env.ts
├── auth/            auth.routes.ts, auth.controller.ts (AuthController), credential-validator.ts, token-issuer.ts, jwks.ts
├── users/           users.routes.ts, user-admin.controller.ts (UserAdminController), user.repository.ts (UserRepository), user.model.ts, password-hasher.ts (PasswordHasher)
├── keys/            key-provider.ts   # carga/genera par RSA
├── seed/            seed-admin.ts
└── middlewares/     require-admin.ts, error-handler.ts
```

| Método | Path | Auth | Interfaz / RF | Detalle |
|---|---|---|---|---|
| POST | `/auth/login` | pública | `IAuthApi` | `LoginRequest{email,password}` → `AuthResponse{accessToken,expiresIn:3600}`; 401 si credenciales inválidas (mismo mensaje para usuario inexistente y clave errónea) |
| GET | `/.well-known/jwks.json` | pública | `IJwks` | Clave pública en formato JWK (`kid`, `alg:RS256`, `use:sig`); `Cache-Control: max-age=300` |
| POST | `/users` | JWT con rol ADMIN | `IUserAdmin` | `CrearUsuarioRequest{email,password,rol}` → `CrearUsuarioResponse{identityUserId}`; 409 email duplicado |
| GET | `/health` | pública | — | healthcheck de compose |

Ruteo: Nginx expone `/auth/*` → Identity. JWKS y `/users` no se publican en Nginx (solo red interna; la API los llama directo a `http://identity:3001`).

- **Claves RSA**: `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` (archivos montados como volumen) o `JWT_PRIVATE_KEY` (PEM en env). Si no existen, en desarrollo se genera el par con `crypto.generateKeyPairSync('rsa',{modulusLength:2048})` y se guarda en volumen; `kid` = hash de la clave pública. En compose se documenta un script `scripts/gen-keys.sh` (openssl) como camino principal.
- **Claims**: `sub`=identityUserId (`_id` de Mongo en string), `roles`=[...], `iss`=`JWT_ISSUER`, `exp`=now+3600.
- **Seed ADMIN**: al arrancar, si no existe `SEED_ADMIN_EMAIL`, crea el usuario con `SEED_ADMIN_PASSWORD` (bcrypt, rondas 10) y rol ADMIN. Idempotente.
- **`/users` desde la API (S6)**: la API reenvía el `Authorization: Bearer` del ADMIN que hizo el alta; Identity lo verifica con su propia clave pública y exige rol ADMIN. Evita un segundo secreto. (Alternativa: token de servicio; ver D9, menor.)
- **Env**: `PORT`, `MONGO_URL`, `JWT_ISSUER`, `JWT_EXPIRES_IN=3600`, `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`, `BCRYPT_ROUNDS`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `LOG_LEVEL`.

### 3.2 SmartParking API (`api/`) — puerto 3000 (2 réplicas)

Libs: `express`, `jsonwebtoken`, `jwks-rsa` (o fetch propio + caché), `@prisma/client` + `prisma`, `ioredis`, `amqplib`, `zod`(D2), `uuid`, `winston`, `dotenv`, `swagger-jsdoc`.

```
src/
├── app.ts, server.ts, config/env.ts
├── auth/                      # módulo transversal
│   ├── jwt-auth.middleware.ts (JwtAuthMiddleware)
│   ├── authorization.guard.ts (AuthorizationGuard: requireRole)
│   ├── ownership.resolver.ts  (OwnershipResolver)
│   └── jwks-client.ts         # IJwks: fetch + caché en memoria de la pública
├── clientes/    clientes.routes|controller|service|repository.ts, cliente.schema.ts (zod)
├── vehiculos/   vehiculos.routes|controller|service|repository.ts
├── reservas/    reservas.routes|controller|service|repository.ts
├── identity/    user-admin.client.ts   # cliente HTTP de IUserAdmin
├── cache/       cache.service.ts       # CacheService (ICache)
├── audit/       audit-event-publisher.ts (puerto IAuditEventPublisher)
│                rabbitmq-audit-publisher.ts (adapter), noop-audit-publisher.ts, audit.factory.ts
├── db/          prisma-primary.ts, prisma-replica.ts
├── shared/      errors.ts (AppError, ConflictError…), error-handler.ts, validate.ts
└── prisma/      schema.prisma, migrations/
```

**Endpoints** (prefijo `/api` aplicado por la API misma; Nginx no reescribe — ver D10):

| Método | Path | Auth | RF | Notas |
|---|---|---|---|---|
| POST/GET/GET:id/PUT/DELETE | `/api/clientes` | ADMIN | RF1 | POST: crea usuario vía `IUserAdmin` y luego Cliente; DELETE con reservas ACTIVAS → 409 |
| POST/GET/PUT/DELETE | `/api/vehiculos` | ADMIN o CLIENTE dueño | RF2 | CLIENTE: `clienteId` sale del token vía OwnershipResolver, se ignora el del body; ADMIN debe enviar `clienteId` |
| POST | `/api/reservas` | ADMIN o CLIENTE dueño del vehículo | RF3 | valida vehículo pertenece al cliente; 409 si solapa |
| PUT | `/api/reservas/:id` | idem | RF3 | modifica fechas; revalida solapamiento |
| POST | `/api/reservas/:id/cancelar` | idem | RF3 | estado → CANCELADA |
| GET | `/api/reservas/:id` | idem | RF3 | |
| GET | `/api/reservas/mias` | CLIENTE | RF4 | cacheada; réplica |
| GET | `/api/admin/reservas?clienteId&estado&desde&hasta` | ADMIN | RF5 | `ReservaFiltroDTO`; cacheada; réplica |
| GET | `/health` | pública | — | |

Orden de middlewares: `JwtAuthMiddleware` → `AuthorizationGuard` / `OwnershipResolver` → validación (zod) → controller. 401 sin/ con token inválido o expirado; 403 rol/pertenencia; 404 recurso inexistente (o ajeno, para no filtrar existencia); 409 solapamiento / borrado con ACTIVAS / email duplicado; 400 validación.

**Prisma (`schema.prisma`)** – base `smartparking`:

| Modelo | Campos clave |
|---|---|
| Cliente | `id` (uuid), `nombre`, `email` (unique), `identityUserId` (unique), `createdAt` |
| Vehiculo | `id`, `matricula` (unique), `marca?`, `modelo?`, `clienteId` → Cliente (FK, `onDelete: Restrict`) |
| Reserva | `id`, `vehiculoId` → Vehiculo (Restrict), `clienteId` (desnormalizado para consultas), `inicio` (timestamptz), `fin` (timestamptz), `estado` enum `EstadoReserva {ACTIVA, CANCELADA}`, `createdAt`, `updatedAt`; CHECK `fin > inicio` |

**Migración SQL manual (EXCLUDE)**: `prisma migrate dev --create-only` → editar el `.sql` para agregar:
`CREATE EXTENSION IF NOT EXISTS btree_gist;` y
`ALTER TABLE "Reserva" ADD CONSTRAINT reserva_no_solapa EXCLUDE USING gist ("vehiculoId" WITH =, tstzrange("inicio","fin") WITH &&) WHERE ("estado" = 'ACTIVA');`
El repository traduce el error PG `23P01` (exclusion_violation) a `ConflictError` (409); `ReservaService` además hace un chequeo previo (consulta de solapamiento) para dar mensaje claro. Las reglas de borde: intervalos semiabiertos `[inicio, fin)`.

**CacheService** (`ICache`, ioredis):

| Clave | Contenido | TTL |
|---|---|---|
| `reservas:mias:{clienteId}` | lista reservas del cliente | 30 s |
| `reservas:admin:{hash(filtro normalizado)}` | resultado de RF5 | 30 s |

Invalidación en alta/modificación/cancelación de reserva: borrar `reservas:mias:{clienteId}` y todas las `reservas:admin:*` (SCAN por prefijo, o mantener un set `reservas:admin:keys`). Si Redis falla, se loguea y se consulta la BD (degradación, no error al usuario).

**Audit (puerto + adapter)**:
- `IAuditEventPublisher.publicar(evento: EventoAuditoriaDTO): Promise<void>`; se invoca desde los services **después del commit**, sin `await` bloqueante para la respuesta (fire-and-forget con captura de errores).
- `RabbitMqAuditPublisher`: `amqplib` con `createConfirmChannel`, exchange `smartparking.events` (topic, durable), routing key `audit.{entidad}.{tipo}` (ej. `audit.reserva.crear`), mensajes `persistent: true`; espera confirm; reintentos con backoff exponencial (`AUDIT_RETRY_MAX=5`, base 200 ms); al agotar → `logger.error` (Winston) con el evento. Reconexión automática de conexión/canal.
- Selección por env `AUDIT_PUBLISHER=rabbitmq|noop` en `audit.factory.ts` (única línea de composición; sustenta el escenario de modificabilidad).
- `EventoAuditoriaDTO {eventId (uuid), tipo (CREAR|MODIFICAR|CANCELAR|ELIMINAR), entidad, entidadId, userId (=sub), fechaHora ISO}`.

**Env**: `PORT`, `DATABASE_URL`, `DATABASE_REPLICA_URL`, `REDIS_URL`, `RABBITMQ_URL`, `AUDIT_PUBLISHER`, `AUDIT_EXCHANGE=smartparking.events`, `AUDIT_RETRY_MAX`, `IDENTITY_BASE_URL`, `JWKS_URL`, `JWT_ISSUER`, `CACHE_TTL_SECONDS=30`, `LOG_LEVEL`, `INSTANCE_ID` (para ver balanceo en logs/cabecera `X-Instance`).

### 3.3 Audit Log Service (`audit-service/`)

Libs: `amqplib`, `winston`, `winston-elasticsearch` (o `@elastic/elasticsearch` con `helpers.bulk`; ver D8), `dotenv`.

```
src/
├── server.ts, config/env.ts
├── consumer/audit-consumer.ts   # AuditConsumer
├── writer/audit-writer.ts       # AuditWriter
└── logger.ts                    # Winston técnico (consola)
```

- Declara exchange `smartparking.events` (topic) y cola durable `audit-log` con binding `audit.#`; `channel.prefetch(AUDIT_PREFETCH=20)`.
- `AuditConsumer`: valida forma del mensaje; mensaje inválido → `nack(requeue=false)` (a DLQ opcional `audit-log.dlq`); válido → `AuditWriter.write(evento)`; **ack solo tras escritura exitosa**; si ES falla → `nack(requeue=true)` con espera, no se pierde.
- `AuditWriter`: indexa en `audit-events` usando `eventId` como `_id` (idempotente ante reentrega at-least-once); mapping: `fechaHora` date, `tipo/entidad/userId` keyword. Crea índice/mapping al arrancar.
- Env: `RABBITMQ_URL`, `AUDIT_QUEUE=audit-log`, `AUDIT_PREFETCH`, `ELASTICSEARCH_URL`, `ES_INDEX=audit-events`, `LOG_LEVEL`.

### 3.4 Nginx (`nginx/nginx.conf`) → ver sección 4.

---

## 4. Docker Compose y Nginx

| Servicio | Imagen / build | Puertos host | Perfil | Depende de |
|---|---|---|---|---|
| nginx | `nginx:alpine` | **8080→80** | default | api, identity |
| identity | build `identity-service/` | (interno 3001) | default | mongo |
| api (x2, `deploy.replicas: 2` o `--scale api=2`) | build `api/` | (interno 3000) | default | postgres, redis, rabbitmq, identity |
| audit | build `audit-service/` | — | default | rabbitmq, elasticsearch |
| mongo | `mongo:7` | 27017 (dev) | default | — |
| postgres | `postgres:16` | 5432 (dev) | default | — |
| postgres-replica | `postgres:16` + streaming | 5433 | `replica` | postgres |
| redis | `redis:7-alpine` | 6379 (dev) | default | — |
| rabbitmq | `rabbitmq:3-management` | 5672, **15672** (UI) | default | — |
| elasticsearch | `elasticsearch:8.x` (single-node, security off en dev) | 9200 | default | — |
| kibana | `kibana:8.x` | **5601** | `kibana` | elasticsearch |

Redes: `public` (solo nginx) y `internal` (resto). Healthchecks en cada dependencia y `depends_on: condition: service_healthy`. Volúmenes para mongo, postgres, es, claves JWT. Las API ejecutan `prisma migrate deploy` al iniciar (o un servicio one-shot `migrate`, preferible con 2 réplicas para evitar carrera).

`nginx.conf` (resumen): `upstream api_pool { server api:3000; }` con resolución DNS de compose (round-robin sobre las réplicas; `resolver 127.0.0.11 valid=5s` si hace falta); `location /auth/ { proxy_pass http://identity:3001; }`; `location /api/ { proxy_pass http://api_pool; }`; headers `X-Forwarded-*`, `X-Request-Id`; no inspecciona JWT; TLS se omite en el prototipo (se declara el HTTPS :443 del diseño como despliegue productivo — o certificado autofirmado opcional, ver D10).

---

## 5. Orden de construcción en hitos

| Hito | Contenido | "Done when" (verificable) |
|---|---|---|
| **H0** Esqueleto + compose | Estructura de carpetas, `package.json`/tsconfig por servicio, `/health` en cada uno, compose con todas las dependencias, `.env.example` | `docker compose up -d` deja todos los servicios `healthy`; `curl localhost:8080/auth/health` y `/api/health` responden 200 |
| **H1** Identity: login + JWKS | Modelo User, PasswordHasher, seed ADMIN, KeyProvider, TokenIssuer, `/auth/login`, JWKS | Login del ADMIN seed devuelve JWT; el JWT decodificado tiene `sub`, `roles`, `iss`, `exp=+3600`; verificación RS256 con la clave del JWKS OK; credenciales malas → 401 |
| **H2** API auth + Clientes + IUserAdmin | JwksClient, JwtAuthMiddleware, AuthorizationGuard, OwnershipResolver, `POST /users` en Identity, módulo Clientes, schema Prisma base | Sin token 401; token CLIENTE en `/api/clientes` 403; ADMIN crea Cliente → existe usuario en Mongo (rol CLIENTE) y fila con `identityUserId` correcto; ese CLIENTE puede loguearse |
| **H3** Vehículos + Reservas + EXCLUDE | Módulos, migración manual EXCLUDE, 409, `/reservas/mias`, `/admin/reservas` con filtros | Reserva solapada → 409 (y 409 también por INSERT directo SQL, probando la constraint); CLIENTE no accede a vehículo/reserva ajena; borrar cliente con ACTIVAS → 409; reserva cancelada libera el horario |
| **H4** Auditoría end-to-end | Puerto + RabbitMqAuditPublisher + factory, Audit Service, índice ES | Cada alta/modif/cancelación genera 1 documento en `audit-events` con `userId`=sub; con `audit` detenido los eventos quedan en la cola y se procesan al reiniciar; con RabbitMQ caído el CRUD responde igual y se loguea el error tras reintentos |
| **H5** Caché + Nginx + réplica | CacheService, invalidación, 2 réplicas API, balanceo, (opcional) postgres-replica | Segunda consulta idéntica no toca la BD (log/contador de hit); tras crear/cancelar reserva la consulta refleja el cambio; `X-Instance` alterna entre las 2 réplicas; apagar una réplica no corta el servicio |
| **H6** Pruebas | Unitarias, integración, k6 | `npm test` verde en api, identity y audit; script k6 ejecutable con umbrales declarados (ver sección 6); reporte guardado |
| **H7** README de ejecución | Prerrequisitos, `cp .env.example .env`, generar claves, `docker compose up`, URLs, credenciales seed, cómo correr tests y k6, cómo probar flujo completo | Un tercero clona, sigue el README y completa login → crear cliente → reserva → ver evento en ES sin ayuda |

---

## 6. Estrategia de pruebas

| Nivel | Qué | Herramientas | Hito |
|---|---|---|---|
| Unitarias | `ReservaService`: solapamiento (adyacentes `[a,b)`/`[b,c)` permitidos, contenidas, parciales, idénticas, canceladas ignoradas, `fin<=inicio` → 400); `OwnershipResolver` (propio / ajeno / sin cliente asociado); `AuthorizationGuard`; `JwtAuthMiddleware` (firma inválida, expirado, issuer erróneo, sin header); `CacheService` (clave, TTL, invalidación); `RabbitMqAuditPublisher` (reintentos/backoff con canal simulado); `TokenIssuer`/`PasswordHasher` | Framework de test (D5) con mocks de repositorios | H2–H4 |
| Integración | API + Postgres + Redis + RabbitMQ reales (testcontainers o compose de test): constraint EXCLUDE ante 2 inserts concurrentes (`Promise.all` → 1 OK, 1 × 409); flujo login→crear cliente→crear reserva; evento llega a ES; caída de RabbitMQ no rompe el CRUD | supertest + compose/testcontainers | H3–H5 |
| Contrato | Respuestas ajustadas a los DTOs de `contracts/` y a Swagger | tipos compartidos / zod | H6 |
| Carga | Escenario A2: 500 req/s sostenidos (`constant-arrival-rate`, `rate: 500`, 2 min), mezcla de lecturas `/api/reservas/mias` y `/api/admin/reservas`, tokens precargados; umbral `http_req_duration{p(95)}<300`, `http_req_failed<1%`. Comparativas: 1 vs 2 réplicas, con/sin caché | k6 (en contenedor) | H6 |
| Manual / humo | Escenarios de seguridad (token manipulado, CLIENTE sobre `/admin/reservas`, `clienteId` ajeno en body) | Postman / curl | H3 |

---

## 7. Decisiones abiertas para el usuario

| # | Decisión | Opción recomendada | Por qué (1 línea) |
|---|---|---|---|
| D1 | **Web Client** | Swagger UI en cada servicio + colección Postman con el flujo completo | El diseño solo exige consumir contratos HTTPS; una SPA suma trabajo sin sumar a la arquitectura evaluada (alternativa: SPA mínima de 3 pantallas, si hay tiempo tras H6). |
| D2 | **Librería de validación** | `zod` | Valida y a la vez infiere tipos TS, que se reutilizan como DTOs. |
| D3 | **Contratos compartidos** | Paquete `contracts/` con npm workspaces (solo tipos) | Evita divergencia de DTOs entre servicios; duplicar es más simple pero se desincroniza. |
| D4 | **Layout del monorepo y docs** | Mover diseño a `docs/` dentro del repo de código | Un solo repo con todo; si la entrega de Parte 1 ya está cerrada, dejar `PAC2/` intacto y crear el código en carpeta hermana. |
| D5 | **Framework de test** | `vitest` (con `supertest`) | Soporta TS sin configuración extra y es rápido; `jest` si el curso/equipo ya lo usa. |
| D6 | **Read Replica real vs opcional** | Opcional (perfil `replica`); por defecto réplica = primaria | El código ya separa `ISqlPrimary`/`ISqlReplica`; la replicación streaming consume tiempo de configuración y no cambia el diseño. Activarla solo si se quiere medirla en k6. |
| D7 | **Prisma vs `pg`** | Mantener Prisma | Decidido en el diseño; el único costo es la migración SQL manual de EXCLUDE y mapear el error `23P01`, ambos acotados. Sin motivo para cambiar. |
| D8 | **Cliente de Elasticsearch en Audit** | `@elastic/elasticsearch` (`helpers.bulk`/`index` con `_id`=eventId) como AuditWriter, Winston solo para log técnico | El diseño dice Winston + transport, pero `winston-elasticsearch` es poco mantenido y no controla `_id` ni errores para el ack; mantener el nombre `AuditWriter` y declarar el matiz. |
| D9 | **Autenticación de `IUserAdmin` (S6)** | Reenviar el JWT del ADMIN que hace el alta | Cero secretos adicionales y la auditoría conserva quién creó el usuario; token de servicio solo si se necesitan altas sin ADMIN. |
| D10 | **Prefijo `/api` y TLS en Nginx** | La API sirve bajo `/api` (sin reescritura) y Nginx en HTTP :8080 | Simplifica Nginx y Swagger; TLS/443 se documenta como despliegue productivo (autofirmado opcional). |
| D11 | **Reparto del equipo (5 personas)** | P1 Identity (H1) · P2 API auth+Clientes (H2) · P3 Vehículos+Reservas+EXCLUDE (H3) · P4 Audit+RabbitMQ+ES (H4) · P5 compose+Nginx+caché+k6 (H0, H5, H6) · todos: tests de su módulo y README (H7) | Fronteras alineadas con los componentes del diseño; H0 y contratos primero y juntos para destrabar al resto. |
| D12 | **Carga de claves RSA** | Par generado con script `openssl` y montado como volumen | Reproducible y evita regenerar la clave (y romper tokens/JWKS) en cada reinicio; autogeneración solo como fallback de desarrollo. |

Dependencias entre tareas del equipo: H0 + `contracts/` (todos) → H1 → H2 → {H3, H4 en paralelo} → H5 → H6 → H7.
