# Guion de demo y defensa – SmartParking (~10–12 min)

## 0. Preparación (antes de la defensa)

```bash
bash scripts/generate-keys.sh        # claves RS256 para Identity
cp .env.example .env
docker compose up -d --build         # todo el sistema
docker compose ps                    # esperar a que todo esté healthy
```

| Qué | URL |
|---|---|
| Aplicación (SPA) y punto de entrada único (Nginx) | http://localhost:8080 |
| Swagger de la API | http://localhost:8080/api/docs |
| RabbitMQ (guest / guest) | http://localhost:15672 |
| Elasticsearch | http://localhost:9200 |
| Kibana (opcional) | `docker compose --profile observability up -d kibana` → http://localhost:5601 |

Credenciales demo (de `.env.example`):

| Rol | Email | Contraseña |
|---|---|---|
| ADMIN | admin@smartparking.local | Admin123! |
| CLIENTE 1 | cliente1@smartparking.local | Cliente123! |
| CLIENTE 2 | cliente2@smartparking.local | Cliente123! |

Variables de shell para copiar y pegar (`jq` opcional):

```bash
B=http://localhost:8080
login() { curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq -r .accessToken; }
TC=$(login cliente1@smartparking.local 'Cliente123!')
TA=$(login admin@smartparking.local 'Admin123!')
```

## Escenas

### 1. Login de cliente y "mis reservas" (RF4, JWT)

```bash
curl -s $B/api/reservas/mias -H "Authorization: Bearer $TC" | jq
echo $TC | cut -d. -f2 | base64 -d 2>/dev/null | jq    # payload decodificado
```

Mostrar en el navegador (DevTools > Application/Network) el token: cabecera `alg: RS256`, claims `sub`, `roles`, `exp`. Decir: el `sub` del JWT es el `identityUserId` del Cliente; la API lo mapea al cliente y nunca acepta un `clienteId` enviado por el cliente (ADR-03).

### 2. Reserva solapada rechazada (409)

```bash
VEH=$(curl -s $B/api/vehiculos -H "Authorization: Bearer $TC" | jq -r '(.items // .)[0].id')
curl -s -X POST $B/api/reservas -H "Authorization: Bearer $TC" -H 'Content-Type: application/json' \
  -d "{\"vehiculoId\":\"$VEH\",\"inicio\":\"2030-01-01T10:00:00Z\",\"fin\":\"2030-01-01T12:00:00Z\"}" | jq   # 201
curl -s -i -X POST $B/api/reservas -H "Authorization: Bearer $TC" -H 'Content-Type: application/json' \
  -d "{\"vehiculoId\":\"$VEH\",\"inicio\":\"2030-01-01T11:00:00Z\",\"fin\":\"2030-01-01T13:00:00Z\"}"         # 409
```

Decir: la regla se valida en `ReservaCommandService` y la garantiza la restricción `EXCLUDE USING gist` de PostgreSQL (sin condiciones de carrera). Si la forma de la respuesta de vehículos difiere, ver `/api/docs`.

### 3. Cancelar, evento en RabbitMQ y audit trail (ADR-01, ADR-08)

```bash
RID=$(curl -s $B/api/reservas/mias -H "Authorization: Bearer $TC" | jq -r '(.items // .)[0].id')
curl -s -X POST $B/api/reservas/$RID/cancelar -H "Authorization: Bearer $TC" | jq
```

- RabbitMQ UI > Exchanges > `smartparking.events` (topic) y Queues: `audit-log` (y `read-model.reservas`). Routing key `reserva.cancelada`.
- Audit trail:

```bash
curl -s 'http://localhost:9200/audit-events/_search?size=3&sort=fechaHora:desc' | jq '.hits.hits[]._source'
```

(o en Kibana: Discover sobre el índice `audit-events`). Mostrar `eventId`, `tipo`, `entidad`, `userId`, `fechaHora`.

### 4. ADMIN: consulta global con filtros (RF5) y 403 para cliente

```bash
curl -s "$B/api/admin/reservas?estado=ACTIVA&page=1&pageSize=10" -H "Authorization: Bearer $TA" | jq
curl -s -i "$B/api/admin/reservas" -H "Authorization: Bearer $TC" | head -1      # 403
```

Filtros disponibles: `clienteId`, `estado`, `desde`, `hasta`, `page`, `pageSize`.

### 5. Alta de cliente (IUserAdmin → identityUserId) y login con el nuevo

```bash
curl -s -X POST $B/api/clientes -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
  -d '{"nombre":"Cliente Demo","email":"demo@smartparking.local","password":"Demo12345!"}' | jq
TN=$(login demo@smartparking.local 'Demo12345!'); curl -s $B/api/reservas/mias -H "Authorization: Bearer $TN" | jq
```

Decir: la API crea el usuario en Identity (puerto `IUserAdmin`) y guarda su `identityUserId` en el Cliente; la contraseña nunca se persiste en la base operacional.

### 6. Modificabilidad: cambiar el mecanismo de log (Escenario 2)

```bash
# En .env: AUDIT_PUBLISHER=log
docker compose up -d --force-recreate api
# repetir escenas 1-3: el CRUD funciona igual; el evento solo sale por Winston (docker compose logs api)
# Volver a AUDIT_PUBLISHER=rabbitmq y recrear api
```

Decir: cambia un adapter y una variable de entorno; 0 cambios en los módulos CRUD (ADR-01, puerto `IAuditEventPublisher`).

### 7. Disponibilidad: se cae RabbitMQ

```bash
docker compose stop rabbitmq
curl -s -i -X POST $B/api/reservas -H "Authorization: Bearer $TC" -H 'Content-Type: application/json' \
  -d "{\"vehiculoId\":\"$VEH\",\"inicio\":\"2031-01-01T10:00:00Z\",\"fin\":\"2031-01-01T11:00:00Z\"}" | head -1   # 201
docker compose logs api --tail 20 | grep AUDIT_PUBLISH_FAILED
docker compose start rabbitmq
```

Decir: el CRUD responde igual; tras 3 reintentos la API registra `AUDIT_PUBLISH_FAILED` en el log técnico. Es la consecuencia negativa aceptada en ADR-01 (mejora futura: Transactional Outbox).

### 8. Performance (Escenario 1)

```bash
curl -s -i $B/api/reservas/mias -H "Authorization: Bearer $TC" | grep -i 'x-cache\|x-upstream'   # MISS
curl -s -i $B/api/reservas/mias -H "Authorization: Bearer $TC" | grep -i 'x-cache\|x-upstream'   # HIT
for i in 1 2 3 4; do curl -s -i $B/api/reservas/mias -H "Authorization: Bearer $TC" | grep -i x-upstream; done
docker run --rm -i --network host grafana/k6 run - < load-tests/k6-consultas.js
# Windows/Docker Desktop: agregar -e BASE_URL=http://host.docker.internal:8080
```

Mostrar `X-Cache: MISS/HIT` (Redis, TTL 30 s, invalidación por clave de versión al escribir) y `X-Upstream-Instance` alternando entre las 2 réplicas (DNS round-robin en Nginx). k6: 500 req/s, umbral p95 < 300 ms.

### 9. Pub/Sub + CQRS (ADR-11)

```bash
CID=$(curl -s $B/api/clientes/me -H "Authorization: Bearer $TC" | jq -r .id)
curl -s $B/consultas/clientes/$CID/resumen -H "Authorization: Bearer $TC" | jq
curl -s $B/consultas/ranking -H "Authorization: Bearer $TA" | jq
```

Mostrar en RabbitMQ la segunda cola `read-model.reservas` (bindings `reserva.*`, `vehiculo.*`) junto a `audit-log` (`#`); crear una reserva y ver cómo cambia el resumen (consistencia eventual, normalmente en menos de 1 s). Apoyarse en la Figura 5 (`docs/diagramas/05-eventos-cqrs.png`).

**Agregar un tercer suscriptor el día de la prueba (< 10 min):**

1. Elegir la routing key (ej. `reserva.cancelada`) y el nombre de cola (ej. `notificaciones`).
2. Copiar `read-model-service/` como esqueleto: dejar el consumidor (assert del exchange, `assertQueue` durable + DLQ, `bindQueue` con la routing key, `prefetch`, `ack` manual) y reemplazar el handler.
3. Idempotencia: usar `eventId` como clave de deduplicación.
4. Si expone HTTP: agregar un `location` nuevo en `nginx/nginx.conf` (misma forma que `/consultas/`).
5. Agregar el servicio en `docker-compose.yml` (copiar el bloque de `read-model-service`, mismas variables `RABBITMQ_URL`, red interna) y ejecutar `docker compose up -d --build <servicio>`.
6. Verificar en la UI de RabbitMQ la nueva cola y binding, y publicar un evento (escena 3). La API no se toca.

## Preguntas probables en la defensa

- **¿Dónde se valida el JWT?** En la API (middleware `auth`) con la clave pública de Identity obtenida por JWKS; no se consulta a Identity en cada request. Identity solo emite tokens.
- **¿Por qué RS256?** Firma asimétrica: solo Identity tiene la clave privada; los demás verifican con la pública (JWKS) y no pueden emitir tokens (ADR-03).
- **¿Por qué cola asíncrona?** Para que el CRUD no espere al log: menor latencia, mayor throughput y desacople de la disponibilidad del log (ADR-01). Costo: consistencia eventual del log.
- **¿Qué pasa si se cae el log?** Si cae Elasticsearch o el Audit Log Service, los mensajes quedan en la cola durable y se procesan al volver (5 reintentos y luego DLQ `audit-log.dlq`). Si cae RabbitMQ, el CRUD sigue; la API reintenta 3 veces y registra `AUDIT_PUBLISH_FAILED` (riesgo residual aceptado; mejora: Outbox).
- **¿Cómo se garantiza el no solapamiento?** Validación en `ReservaCommandService` y restricción `EXCLUDE USING gist` en PostgreSQL sobre el rango por vehículo; intervalos semiabiertos `[inicio, fin)`; ante conflicto, 409.
- **¿Cómo se cambia el mecanismo de log?** Con un nuevo adapter de `IAuditEventPublisher` y la variable `AUDIT_PUBLISHER` (`rabbitmq` | `log`); los módulos CRUD no cambian (Escenario 2).
- **¿CQRS y consistencia eventual?** Los comandos van a PostgreSQL primaria; las consultas agregadas, a una proyección en MongoDB alimentada por eventos. Hay un retardo entre el commit y la vista; se acepta a cambio de performance y desacople. La proyección es reconstruible y el procesamiento es idempotente por `eventId` (ADR-11).
- **¿Por qué el cliente oficial de Elasticsearch y no `winston-elasticsearch`?** Para confirmar la escritura antes del `ack` y fijar `_id = eventId` (idempotencia) (ADR-08).
