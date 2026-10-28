# ADR-01: Comunicación de operaciones exitosas al componente de registro de eventos

## Contexto

Cada alta, modificación o cancelación exitosa en Clientes, Vehículos o Reservas debe notificarse a un componente de registro (Audit Log) con log independiente. Fuerzas en tensión:

- **Performance**: el CRUD debe sostener 500 req/s de consulta con p95 < 300 ms; la escritura de auditoría no debe frenarlo.
- **Modificabilidad**: debe poder cambiarse el mecanismo de registro sin modificar la lógica CRUD.
- **Disponibilidad**: una caída del log no debería impedir operar el negocio.
- **Integrabilidad**: la API y el log interactúan por un contrato explícito (EventoAuditoriaDTO).
- **Complejidad / operación**: el equipo debe poder construir y operar la solución.

## Alternativas consideradas

**A. HTTP/REST síncrono al Audit Log.** La API invoca al Audit Log dentro del pedido.

- Pros: simple; menor latencia hasta que el evento queda registrado; consistencia inmediata.
- Contras: acopla la disponibilidad del CRUD a la del log; suma latencia a cada escritura; limita el *throughput*; requiere reintentos y manejo de timeouts en la API.
- Atributos: favorece simplicidad; perjudica Performance, Disponibilidad y Modificabilidad.

**B. Cola asíncrona pub/sub con RabbitMQ (elegida).** La API publica EventoAuditoriaDTO en el exchange `smartparking.events`; el Audit Log consume de la cola durable `audit-log`.

- Pros: el CRUD no espera al log; tolera caídas del log (la cola retiene); se pueden sumar suscriptores sin tocar la API; contrato claro.
- Contras: consistencia eventual del log; infraestructura adicional (broker); posible pérdida de eventos si el publish falla tras el commit.
- Atributos: favorece Performance, Modificabilidad, Disponibilidad e Integrabilidad; perjudica Complejidad.

**C. Transactional Outbox + cola.** El evento se guarda en una tabla de la misma transacción de negocio; un relay lo publica a la cola.

- Pros: no se pierden eventos (atomicidad evento–dato); desacoplado como B.
- Contras: mayor complejidad (tabla, relay, deduplicación); más carga sobre la BD operacional; más piezas a operar.
- Atributos: favorece Disponibilidad/consistencia del log; perjudica Complejidad y algo de Performance en escritura.

| Alternativa | Modificabilidad | Performance (CRUD) | Disponibilidad | Complejidad |
|---|---|---|---|---|
| A. HTTP síncrono | Baja (acoplamiento directo) | Baja (espera al log) | Baja (depende del log) | Baja |
| B. Cola pub/sub (elegida) | Alta | Alta | Alta (riesgo residual de pérdida) | Media |
| C. Outbox + cola | Alta | Media-alta | Muy alta | Alta |

**Trade-off síncrono vs. asíncrono.** El modo síncrono da menor latencia de registro, pero acopla y limita el *throughput*; el asíncrono logra mayor *throughput* del CRUD a costa de mayor latencia (y consistencia eventual) del log.

## Decisión

Nosotros usaremos una cola de mensajes asíncrona con modelo publicador-suscriptor sobre RabbitMQ. La API publicará un EventoAuditoriaDTO en el exchange `smartparking.events` (topic) después del *commit* de cada operación exitosa, mediante el puerto `IAuditEventPublisher` y su adapter RabbitMQ, con *publisher confirms* y reintentos con *backoff*. El Audit Log Service se suscribirá con la cola durable `audit-log`.

## Justificación

- El CRUD responde sin esperar al log, lo que sostiene el escenario 1 (táctica *limitar la respuesta a eventos*).
- El puerto + adapter + broker aíslan el mecanismo y sostienen el escenario 2 (*encapsular*, *uso de intermediario*, *diferir enlaces*).
- Se descartó A porque acopla la disponibilidad y la latencia del CRUD al log, contradiciendo los atributos priorizados.
- Se descartó C (por ahora) porque su complejidad adicional no se justifica para el alcance; queda como mejora futura si se exige cero pérdida.
- RabbitMQ y Winston/Elasticsearch fueron vistos en el curso y encajan con el atributo buscado.

## Estado

Aceptado

## Consecuencias

**Positivas**

- El CRUD no se ve afectado por la latencia ni por caídas del log.
- Mayor *throughput* de escritura; el intermediario agrega latencia al registro, no al CRUD.
- Cambiar el mecanismo de registro implica un nuevo adapter y configuración (0 cambios en módulos CRUD).
- Se pueden sumar suscriptores (p. ej. notificaciones, analítica) sin tocar la API.

**Negativas**

- Posible pérdida de eventos si RabbitMQ no está disponible tras el *commit*: la operación de negocio se confirma igual. Se mitiga con *publisher confirms*, reintentos con *backoff* y registro del error en el log técnico Winston; el Transactional Outbox (alternativa C) queda como mejora futura.
- Consistencia eventual: el evento puede tardar en aparecer en el log.
- Infraestructura adicional que operar y monitorear (broker, colas durables).
- Mayor latencia de registro respecto de la alternativa síncrona.
