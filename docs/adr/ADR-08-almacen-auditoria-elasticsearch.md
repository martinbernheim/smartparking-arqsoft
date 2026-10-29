# ADR-08: Almacén del registro de auditoría en Elasticsearch

## Contexto

El Audit Log Service consume los EventoAuditoriaDTO (ADR-01) y debe persistirlos en un log independiente de las bases del negocio, consultable por quién, qué y cuándo. Fuerzas en tensión:

- **Seguridad**: el registro es un *audit trail*; no debe poder alterarse con las operaciones del negocio.
- **Performance**: escritura continua sin afectar al CRUD y búsquedas por usuario, entidad y fecha.
- **Modificabilidad**: el destino físico del log debe poder cambiarse sin tocar al consumidor.
- **Complejidad**: infraestructura adicional.

## Alternativas consideradas

**A. Colección en MongoDB.**

- Pros: tecnología ya presente; esquema flexible.
- Contras: comparte tecnología con la base de identidad (riesgo de mezclar dominios); búsqueda y agregaciones menos adecuadas; sin herramienta de consulta visual lista.
- Atributos: favorece Complejidad baja; perjudica la consulta y la separación.

**B. Tabla en una base PostgreSQL separada.**

- Pros: consultas SQL conocidas; transaccional.
- Contras: otra instancia relacional que operar; esquema rígido para un registro de eventos; menor escalabilidad de escritura y búsqueda que un índice orientado a eventos.
- Atributos: favorece Consistencia; perjudica Performance de búsqueda y Complejidad.

**C. Archivos de log.**

- Pros: mínimo costo.
- Contras: consulta pobre; difícil de proteger e indexar; sin búsqueda estructurada.
- Atributos: favorece simplicidad; perjudica Seguridad (trazabilidad) y consulta.

**D. Elasticsearch con el cliente oficial `@elastic/elasticsearch` (elegida).** Winston queda para el log técnico del servicio. Kibana opcional para consulta.

- Pros: pensado para eventos con marca de tiempo; búsqueda y filtros por campo; visto en el curso; Kibana visualiza el *audit trail*.
- Contras: servicio pesado en memoria; el evento tarda en ser visible tras indexarse; operación más compleja.
- Atributos: favorece Seguridad (trazabilidad) y Performance de búsqueda; perjudica Complejidad.

**E. Winston + transporte `winston-elasticsearch` (considerada y descartada).**

- Pros: poco código; Winston ya se usa para logs técnicos.
- Contras: el transporte escribe de forma *fire-and-forget* con buffer interno y sin confirmación por documento, por lo que no se puede hacer `ack` del mensaje solo después de que el evento esté persistido; tampoco permite controlar el `_id` del documento, necesario para la idempotencia ante reentregas.
- Atributos: favorece Complejidad baja; perjudica la garantía de entrega y la idempotencia del audit trail.

| Alternativa | Trazabilidad / consulta | Aislamiento del negocio | Complejidad |
|---|---|---|---|
| A. MongoDB | Media | Media | Baja |
| B. PostgreSQL separada | Media | Alta | Media |
| C. Archivos | Baja | Media | Muy baja |
| D. Elasticsearch + cliente oficial (elegida) | Alta | Alta | Alta |
| E. winston-elasticsearch | Media (sin confirmación de escritura) | Alta | Media |

## Decisión

Nosotros usaremos Elasticsearch como almacén del registro de auditoría. El Audit Log Service escribirá cada evento con el cliente oficial `@elastic/elasticsearch` en el índice `audit-events`, usando `eventId` como `_id` del documento, y confirmará (`ack`) el mensaje de la cola solo después de la escritura. Winston se usa únicamente para el logging técnico del servicio. Kibana será opcional para consulta visual.

## Justificación

- Táctica de Seguridad *mantener audit trail* (Recuperar): cada operación exitosa queda registrada con usuario, entidad y fecha en un almacén separado del negocio.
- El uso de `eventId` como `_id` hace la escritura idempotente ante reentregas de la cola (ADR-01).
- La escritura con el cliente oficial devuelve confirmación por documento, lo que permite el `ack` manual tras persistir; con 5 reintentos fallidos el mensaje va a la DLQ `audit-log.dlq`.
- Se descartó E (`winston-elasticsearch`) porque su escritura es *fire-and-forget* con buffer, sin confirmación ni control de `_id`.
- Se descartó A para no mezclar el log con la tecnología de identidad, B por rigidez y costo operativo, y C por su pobre capacidad de consulta.

## Estado

Aceptado

Revisión 2026-10-28: el plan inicial (D8) preveía Winston + `winston-elasticsearch`; en la implementación se cambió al cliente oficial `@elastic/elasticsearch` para poder confirmar la escritura antes del `ack` y fijar `_id = eventId` (idempotencia). La decisión de fondo (Elasticsearch como almacén) no cambia.

## Consecuencias

**Positivas**

- Búsqueda por usuario, entidad, tipo y rango de fechas sin impactar a la base operacional.
- Escritura idempotente, compatible con reentregas.
- Kibana permite revisar el registro visualmente.

**Negativas**

- Elasticsearch consume memoria y suma un servicio pesado a operar.
- El evento puede tardar en ser visible tras indexarse.
- Sin controles propios de inmutabilidad en el prototipo (seguridad deshabilitada en desarrollo).

Relacionado con: ADR-01, ADR-10
