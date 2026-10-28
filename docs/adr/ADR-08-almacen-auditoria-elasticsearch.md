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

**D. Elasticsearch con Winston + `winston-elasticsearch` (elegida).** Kibana opcional para consulta.

- Pros: pensado para eventos con marca de tiempo; búsqueda y filtros por campo; visto en el curso; Kibana visualiza el *audit trail*.
- Contras: servicio pesado en memoria; el evento tarda en ser visible tras indexarse; operación más compleja.
- Atributos: favorece Seguridad (trazabilidad) y Performance de búsqueda; perjudica Complejidad.

| Alternativa | Trazabilidad / consulta | Aislamiento del negocio | Complejidad |
|---|---|---|---|
| A. MongoDB | Media | Media | Baja |
| B. PostgreSQL separada | Media | Alta | Media |
| C. Archivos | Baja | Media | Muy baja |
| D. Elasticsearch (elegida) | Alta | Alta | Alta |

## Decisión

Nosotros usaremos Elasticsearch como almacén del registro de auditoría. El Audit Log Service escribirá cada evento con Winston y el transporte `winston-elasticsearch` en el índice `audit-events`, usando `eventId` como identificador del documento. Kibana será opcional para consulta visual.

## Justificación

- Táctica de Seguridad *mantener audit trail* (Recuperar): cada operación exitosa queda registrada con usuario, entidad y fecha en un almacén separado del negocio.
- El uso de `eventId` como `_id` hace la escritura idempotente ante reentregas de la cola (ADR-01).
- Se descartó A para no mezclar el log con la tecnología de identidad, B por rigidez y costo operativo, y C por su pobre capacidad de consulta.

## Estado

Aceptado

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
