# ADR-04: Almacén de identidad separado en MongoDB

## Contexto

Los usuarios y sus credenciales (hash de contraseña, roles) deben guardarse en una base distinta de la del negocio. Fuerzas en tensión:

- **Seguridad**: las credenciales no deben ser alcanzables desde el código ni desde las consultas del negocio.
- **Modificabilidad**: Identity debe poder cambiar su modelo de datos sin afectar a Clientes, Vehículos y Reservas.
- **Restricción del enunciado**: la base de identidad debe ser independiente de la operacional.
- **Complejidad**: cuántas tecnologías de datos debe operar el equipo.

## Alternativas consideradas

**A. Segunda instancia de PostgreSQL.**

- Pros: una sola tecnología de datos; el equipo ya la usa para el negocio.
- Contras: el modelo de usuario es simple y no requiere relaciones ni restricciones complejas; la separación tecnológica es menos evidente.
- Atributos: favorece Complejidad baja; aporta menos diferenciación del límite de Seguridad.

**B. Misma base PostgreSQL, esquema distinto.**

- Pros: mínimo costo operativo.
- Contras: no cumple la separación exigida por el enunciado; las credenciales de ambos dominios comparten motor, usuario de conexión y ciclo de vida.
- Atributos: favorece Complejidad; perjudica Seguridad y Modificabilidad. Descartada por el enunciado.

**C. MongoDB con Mongoose, instancia propia (elegida).**

- Pros: documento de usuario simple y flexible (roles, atributos futuros); separación física y tecnológica clara; visto en el curso.
- Contras: segunda tecnología de datos a operar; sin FK ni transacciones relacionales con el negocio (el vínculo es lógico: `sub` = `Cliente.identityUserId`).
- Atributos: favorece Seguridad y Modificabilidad; perjudica Complejidad.

| Alternativa | Seguridad (aislamiento) | Modificabilidad | Complejidad | Cumple enunciado |
|---|---|---|---|---|
| A. 2.ª instancia PostgreSQL | Media-alta | Media | Baja | Sí |
| B. Mismo PG, otro esquema | Baja | Baja | Muy baja | No |
| C. MongoDB (elegida) | Alta | Alta | Media | Sí |

## Decisión

Nosotros usaremos MongoDB con Mongoose como almacén exclusivo de Identity Service, en una instancia y con credenciales propias, sin ningún acceso desde la API ni desde el Audit Log Service. El vínculo con el negocio será lógico: `JWT.sub` = `Cliente.identityUserId`.

## Justificación

- Táctica de Seguridad *limitar acceso* (limitar exposición): solo Identity conecta a su base; los hashes nunca salen de ese límite ni residen en el modelo `Cliente`.
- Táctica de Modificabilidad *restringir dependencias*: el esquema de identidad puede evolucionar sin migraciones sobre la base operacional.
- Se descartó B por el enunciado y A porque el beneficio de una sola tecnología no compensa la menor diferenciación del límite de seguridad para un modelo de usuario tan simple.

## Estado

Aceptado

## Consecuencias

**Positivas**

- Aislamiento claro de credenciales: una filtración de la base operacional no expone hashes.
- Identity puede cambiar su modelo sin afectar al negocio.

**Negativas**

- Dos tecnologías de datos que operar, respaldar y monitorear.
- No existe integridad referencial entre usuario y Cliente: el alta requiere coordinar dos escrituras (Identity y API) y manejar fallas parciales.
- La consistencia entre ambas bases queda a cargo de la lógica de alta (flujo `IUserAdmin`).

Relacionado con: ADR-03, ADR-05
