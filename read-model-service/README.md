# read-model-service

Lado **QUERY** de CQRS y segundo suscriptor Pub/Sub. Declara la cola durable `read-model.reservas` (DLQ propia
`read-model.reservas.dlq`, vía `smartparking.events.dlx`) ligada al exchange topic `smartparking.events` con las routing keys
`reserva.*`, `vehiculo.*` y `cliente.*` (no `#`; `cliente.*` aporta nombre/email/identityUserId). Audit Service sigue
recibiendo todo (`#`) en su cola `audit-log`: cada suscriptor tiene su propia cola, así que reciben cada evento de forma independiente.

## Modelo de lectura

MongoDB, base **`smartparking_read`** (misma instancia que Identity, base distinta). Es una vista **derivada y
reconstruible**; la fuente de verdad del negocio sigue siendo PostgreSQL (lado comando de la API).

- `resumen_cliente`: `{clienteId, nombre, email, identityUserId, reservasActivas, reservasCanceladas, totalHorasReservadas,
  proximaReserva, ultimaActualizacion, vehiculos[]}` (horas = suma de reservas ACTIVAS).
- Estado proyectado de apoyo: `reservas_proy`, `vehiculos_proy`, `clientes_proy` y `eventos_procesados` (eventId, TTL 30 días).

La proyección usa el campo opcional `datos` (snapshot de la entidad tras el cambio) de `EventoAuditoriaDTO`. Es idempotente
(eventId ya procesado se ignora) y tolerante a desorden (last-write-wins por `fechaHora` de cada reserva/vehículo, y el
resumen se recalcula desde el estado, no con contadores incrementales). Eventos sin `datos` (legado) se ignoran.
El modelo **arranca vacío** y se completa a medida que llegan eventos (no hay backfill del seed). Para reconstruirlo basta con
borrar la base `smartparking_read` y reponer los eventos (no implementado: no hay replay).

## HTTP (vía Nginx: `/consultas/*`, puerto interno 3004)

JWT RS256 verificado con el JWKS de Identity (igual que la API).

- `GET /consultas/clientes/:clienteId/resumen`: ADMIN cualquiera; CLIENTE solo el suyo (`sub` del JWT == `identityUserId`
  proyectado; se aprende de eventos de Cliente o de reservas/vehículos creados por el propio cliente). Si aún no se pudo
  vincular, responde 403 al CLIENTE.
- `GET /consultas/ranking?limit=` (1-100, por defecto 10): top por reservas activas. Solo ADMIN.
- `GET /health`.

Env: `RABBITMQ_URL`, `READMODEL_MONGO_URL`, `READMODEL_DB`, `READMODEL_QUEUE`, `READMODEL_ROUTING_KEYS`, `READMODEL_PREFETCH` (1 = serial),
`JWKS_URL`, `JWT_ISSUER`, `PORT`.
