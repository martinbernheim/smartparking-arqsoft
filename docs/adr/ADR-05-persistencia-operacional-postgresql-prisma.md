# ADR-05: Persistencia operacional en PostgreSQL con Prisma

## Contexto

Clientes, Vehículos y Reservas requieren relaciones, integridad referencial y, sobre todo, la regla de que un vehículo no puede tener dos reservas activas con intervalos solapados, aun ante pedidos concurrentes. Además las consultas de lectura deben escalar. Fuerzas en tensión:

- **Integridad / consistencia**: la regla de no solapamiento no puede depender solo de código de aplicación con varias instancias de la API.
- **Performance**: 500 req/s de consulta con p95 < 300 ms; las lecturas deben poder descargarse de la primaria.
- **Modificabilidad**: el acceso a datos debe estar encapsulado detrás de repositorios.
- **Complejidad**: el equipo debe dominar la herramienta.

## Alternativas consideradas

**A. MySQL.**

- Pros: muy difundido; réplicas bien soportadas.
- Contras: no ofrece restricciones de exclusión (`EXCLUDE`) sobre rangos; el no solapamiento quedaría solo en la aplicación.
- Atributos: favorece familiaridad; perjudica Integridad ante concurrencia.

**B. MongoDB también para los datos de negocio.**

- Pros: una sola tecnología de datos en el sistema.
- Contras: sin FK ni restricciones de exclusión; las invariantes recaen en la aplicación; el modelo es naturalmente relacional.
- Atributos: favorece flexibilidad de esquema; perjudica Integridad.

**C. PostgreSQL con cliente `pg` sin ORM.**

- Pros: control total del SQL; sin dependencias adicionales.
- Contras: más código repetitivo y sin tipos generados; mayor riesgo de divergencia con los DTOs.
- Atributos: favorece control; perjudica Modificabilidad y productividad.

**D. PostgreSQL con TypeORM.**

- Pros: ORM completo basado en decoradores.
- Contras: el equipo no lo trabajó en el curso; migraciones y tipado menos predecibles.
- Atributos: similar a la opción elegida, con mayor curva de aprendizaje.

**E. PostgreSQL con Prisma (elegida).**

- Pros: esquema declarativo, cliente tipado, migraciones; permite editar la migración para agregar SQL propio (`EXCLUDE`); visto en el curso.
- Contras: no expresa `EXCLUDE` en su esquema (migración SQL manual); capa adicional entre código y SQL.
- Atributos: favorece Integridad, Modificabilidad y productividad; costo moderado de Complejidad.

| Alternativa | Integridad (no solapamiento) | Performance de lectura | Modificabilidad | Complejidad |
|---|---|---|---|---|
| A. MySQL | Baja | Alta | Media | Baja |
| B. MongoDB | Baja | Alta | Media | Baja |
| C. pg sin ORM | Alta | Alta | Baja | Media |
| D. TypeORM | Alta | Alta | Media | Media-alta |
| E. PostgreSQL + Prisma (elegida) | Alta | Alta | Alta | Media |

## Decisión

Nosotros usaremos PostgreSQL como base operacional y Prisma como capa de acceso, con la restricción `EXCLUDE USING gist (vehiculoId WITH =, tstzrange(inicio, fin) WITH &&) WHERE estado = 'ACTIVA'` (extensión `btree_gist`) agregada en una migración SQL manual. Las escrituras irán a la primaria y las lecturas a una réplica de lectura (opcional, perfil `replica`; por defecto apunta a la primaria). El error de exclusión (`23P01`) se traducirá a 409.

## Justificación

- Integridad: la base garantiza el no solapamiento aun con N instancias de la API concurrentes; el chequeo previo en `ReservaService` solo mejora el mensaje de error.
- Táctica de Performance *múltiples copias de datos* (Gestionar recursos): la réplica de lectura descarga a la primaria; el código ya separa `ISqlPrimary` e `ISqlReplica`.
- Táctica de Modificabilidad *encapsular*: los repositorios sobre Prisma ocultan el acceso a datos.
- Se descartó A y B por no garantizar la invariante en la base, C por costo de mantenimiento y D por no ofrecer ventaja frente a Prisma.

## Estado

Aceptado

## Consecuencias

**Positivas**

- La regla de negocio crítica queda garantizada por el motor, no solo por la aplicación.
- Lecturas escalables mediante réplica; esquema y tipos versionados.

**Negativas**

- La réplica introduce retraso de replicación (consistencia eventual en lecturas).
- Parte del esquema vive en SQL manual fuera del modelo de Prisma: debe preservarse al regenerar migraciones.
- Prisma agrega una capa y un paso de generación de cliente en el build.

Relacionado con: ADR-02, ADR-04, ADR-06
