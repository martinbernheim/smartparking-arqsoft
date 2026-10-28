# ADR-06: Caché de consultas de reservas con Redis

## Contexto

Las consultas de reservas propias (RF4) y globales con filtros (RF5) son las más frecuentes y se repiten con los mismos parámetros. Fuerzas en tensión:

- **Performance**: 500 req/s con p95 < 300 ms; evitar que cada consulta llegue a la base.
- **Consistencia**: el usuario no debe ver datos viejos tras crear o cancelar una reserva.
- **Escalabilidad horizontal**: hay N instancias de la API detrás del balanceador.
- **Disponibilidad**: una falla de la caché no debe romper el servicio.

## Alternativas consideradas

**A. Sin caché (solo réplica de lectura).**

- Pros: sin problemas de consistencia adicionales; menos piezas.
- Contras: toda consulta llega a la base; menor margen para el p95 bajo carga.
- Atributos: favorece Consistencia y simplicidad; perjudica Performance.

**B. Caché en memoria de cada instancia de la API.**

- Pros: sin infraestructura adicional; latencia mínima.
- Contras: cada instancia tiene su propia copia; la invalidación no se propaga entre instancias, por lo que una instancia puede servir datos viejos tras una escritura hecha en otra.
- Atributos: favorece Performance local; perjudica Consistencia.

**C. Redis compartido con TTL e invalidación (elegida).**

- Pros: caché única para todas las instancias; invalidación explícita en alta/modificación/cancelación; el TTL acota la obsolescencia.
- Contras: componente adicional a operar; viaje de red hacia Redis; ventana de inconsistencia posible.
- Atributos: favorece Performance con Consistencia acotada; perjudica Complejidad.

| Alternativa | Performance | Consistencia entre instancias | Complejidad |
|---|---|---|---|
| A. Sin caché | Media | Alta | Baja |
| B. En memoria por instancia | Alta | Baja | Baja |
| C. Redis compartido (elegida) | Alta | Media-alta | Media |

**Trade-off Performance vs. consistencia.** Más caché implica respuestas más rápidas pero con riesgo de datos desactualizados; el TTL y la invalidación acotan ese riesgo.

## Decisión

Nosotros usaremos Redis como caché compartida de las consultas de reservas (`reservas:mias:{clienteId}` y `reservas:admin:{hash(filtro)}`) con TTL de 30 segundos. Toda alta, modificación o cancelación de reserva invalidará las claves afectadas. Si Redis no responde, la API consultará la base y registrará el error.

## Justificación

- Táctica de Performance *múltiples copias de datos* (Gestionar recursos): Redis mantiene una copia de los resultados más consultados cerca de la API. Redis es la herramienta, no la táctica.
- Se descartó A por no ofrecer margen de Performance y B por la inconsistencia entre instancias, incompatible con el balanceo de ADR-07.
- El TTL de 30 s más la invalidación acotan la obsolescencia aun si una invalidación falla.
- La regla de no solapamiento no depende de la caché: se garantiza en la primaria (ADR-05).

## Estado

Aceptado

## Consecuencias

**Positivas**

- Reducción de carga sobre PostgreSQL y mejor latencia p95 en lecturas repetidas.
- Caché coherente entre todas las instancias de la API.
- Degradación controlada: sin Redis el sistema sigue funcionando, más lento.

**Negativas**

- Ventana de datos potencialmente desactualizados de hasta 30 s si falla una invalidación.
- Infraestructura adicional que operar y monitorear.
- La invalidación de las consultas administrativas es más costosa (varias claves por filtro).

Relacionado con: ADR-05, ADR-07
