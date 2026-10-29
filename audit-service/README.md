# audit-service

Consume eventos de auditoría de RabbitMQ (exchange topic `smartparking.events`, cola `audit-log`, binding `#`) y los
persiste en Elasticsearch (`audit-events`, `_id = eventId`). Mensajes inválidos o con escritura fallida tras N reintentos
van a `smartparking.events.dlx` -> `audit-log.dlq`.

- `GET /health` (503 si RabbitMQ no está conectado) y `GET /audit/events?entidad&entidadId&limit` (solo lectura, demo). Puerto 3003.
- Env: `RABBITMQ_URL`, `ELASTICSEARCH_URL`, `AUDIT_INDEX`, `PORT`, `LOG_LEVEL`, `AUDIT_PREFETCH`, `AUDIT_WRITE_RETRIES`, `AUDIT_RETRY_BASE_MS`.
- Idempotencia: por `eventId` (una reentrega at-least-once no duplica). No deduplica eventos con eventId distinto.
- Prueba manual: `npx tsx scripts/publish-test-event.ts [routingKey]`.
