# ADR-11: CQRS con modelo de lectura (read-model-service) como segundo suscriptor

## Contexto

La API atiende comandos (crear, modificar, cancelar reservas) y consultas (RF4, RF5) sobre la misma base operacional; las consultas ya se apoyan en la réplica de lectura y en Redis (ADR-05, ADR-06). Aparecen consultas agregadas por cliente (resumen de reservas, ranking de clientes) que serían costosas o complejas de resolver sobre el modelo normalizado. Además, el exchange `smartparking.events` (ADR-01) ya publica todos los eventos de negocio, por lo que se puede construir una vista de lectura a partir de ellos. Fuerzas en tensión:

- **Performance**: consultas agregadas rápidas sin cargar la base primaria ni la réplica.
- **Modificabilidad**: agregar capacidades de consulta sin tocar la API.
- **Consistencia**: la vista puede estar levemente desactualizada.
- **Complejidad**: otro servicio y otra base que operar.

## Alternativas consideradas

**A. Consultas directamente sobre la réplica (situación actual).**

- Pros: sin componentes nuevos; datos siempre consistentes con la réplica.
- Contras: agregaciones por cliente recalculadas en cada consulta; carga sobre la réplica; acopla el modelo de consulta al esquema de escritura.
- Atributos: favorece Complejidad baja; perjudica Performance de consultas agregadas.

**B. Vistas materializadas en PostgreSQL.**

- Pros: sin servicio nuevo; SQL conocido.
- Contras: el refresco (`REFRESH`) es manual o periódico y consume recursos de la base; el modelo de lectura sigue acoplado a la base operacional; no demuestra el patrón publicador-suscriptor.
- Atributos: favorece Complejidad baja; perjudica Modificabilidad.

**C. Modelo de lectura en Redis.**

- Pros: lecturas muy rápidas.
- Contras: almacén volátil, poco apto para una proyección que debe poder reconstruirse y consultarse con estructura; ya se usa como caché con TTL.
- Atributos: favorece Performance; perjudica durabilidad y flexibilidad de consulta.

**D. `read-model-service` con proyección en MongoDB (elegida).** Segundo suscriptor del exchange que mantiene una vista denormalizada.

- Pros: consulta O(1) por cliente; desacoplado de la API y de la base operacional; reconstruible desde los eventos; se suma sin modificar la API.
- Contras: consistencia eventual; un servicio más; los eventos deben transportar un snapshot de datos.
- Atributos: favorece Performance y Modificabilidad; perjudica Consistencia y Complejidad.

| Alternativa | Performance de consultas agregadas | Modificabilidad | Consistencia | Complejidad |
|---|---|---|---|---|
| A. Réplica directa | Baja | Baja | Alta | Muy baja |
| B. Vistas materializadas | Media | Baja | Media | Baja |
| C. Redis como modelo | Alta | Media | Baja | Media |
| D. read-model-service (elegida) | Alta | Alta | Media (eventual) | Alta |

## Decisión

Nosotros incorporaremos un `read-model-service` como lado de consulta de CQRS y segundo suscriptor del exchange `smartparking.events`:

- Se suscribe con las routing keys `reserva.*` y `vehiculo.*` mediante su propia cola durable `read-model.reservas` (con DLQ `read-model.reservas.dlq` en el dead-letter exchange).
- Mantiene la proyección denormalizada `resumen_cliente` en la base MongoDB `smartparking_read`, separada de la base de identidad aunque comparta servidor. Es una vista derivada y reconstruible.
- Expone `GET /consultas/clientes/:clienteId/resumen` y `GET /consultas/ranking` detrás de Nginx en `/consultas/`, protegidas con JWT.
- El `EventoAuditoriaDTO` se extiende con un campo opcional `datos` (snapshot de la entidad), de modo que el suscriptor no necesite consultar a la API.
- El procesamiento es idempotente por `eventId`; el `ack` es manual tras actualizar la proyección.

El lado de comando sigue siendo `ReservaCommandService` sobre PostgreSQL primaria; el lado de consulta existente (`ReservaQueryService`, réplica + Redis) se mantiene.

## Justificación

- Táctica de Performance *múltiples copias de datos*: la proyección es una copia optimizada para consultas agregadas.
- Táctica de Modificabilidad *diferir enlaces* (publicador/suscriptor): el nuevo servicio se acopla solo al contrato del evento y a la routing key; no se modifica la API.
- La idempotencia por `eventId` tolera reentregas de la cola, igual que en el Audit Log Service (ADR-08).
- Se descartó A por no aliviar la carga de agregación, B por el acoplamiento y el costo de refresco, y C por la volatilidad del almacén.

## Estado

Aceptado

## Consecuencias

**Positivas**

- Consultas agregadas rápidas sin carga sobre la base operacional.
- Se pueden agregar más suscriptores (tercer consumidor) con una nueva cola y binding, sin tocar la API.
- La proyección se puede borrar y reconstruir desde los eventos.

**Negativas**

- Consistencia eventual: una reserva recién creada puede tardar en reflejarse en `/consultas/`. Para datos que requieren lectura inmediata se usa `/api/`.
- Un servicio y una base lógica más que operar y monitorear.
- Los eventos crecen (snapshot `datos`) y el contrato debe versionarse con cuidado.

Relacionado con: ADR-01, ADR-05, ADR-06, ADR-08
