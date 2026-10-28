# ADR-07: Punto de entrada único con Nginx como proxy inverso y balanceador

## Contexto

El sistema expone Identity Service y la SmartParking API, esta última con múltiples instancias. Fuerzas en tensión:

- **Performance**: 500 req/s con p95 < 300 ms; hay que repartir carga entre instancias de la API.
- **Seguridad**: los servicios y las bases no deben ser accesibles directamente desde el exterior.
- **Modificabilidad**: sumar o quitar instancias, o mover rutas, no debe afectar a los clientes.
- **Complejidad**: cuánta infraestructura se agrega delante de los servicios.

## Alternativas consideradas

**A. Acceso directo a cada servicio.**

- Pros: sin pieza adicional.
- Contras: el cliente conoce direcciones y puertos de cada servicio; no hay reparto de carga entre instancias; superficie de ataque mayor.
- Atributos: favorece simplicidad; perjudica Performance, Seguridad y Modificabilidad.

**B. API Gateway completo (p. ej. Kong).**

- Pros: autenticación, límite de tasa, plugins y observabilidad integrados.
- Contras: mayor complejidad y consumo; duplicaría o desplazaría la validación de JWT que el diseño ubica en la API; sobredimensionado para el alcance.
- Atributos: favorece Seguridad y gobernanza; perjudica Complejidad.

**C. Nginx como proxy inverso y balanceador (elegida).**

- Pros: único punto de entrada; balanceo round-robin entre instancias de la API; configuración declarativa y liviana; también sirve la SPA (ADR-09).
- Contras: es un punto único de falla en el prototipo; no ofrece por sí solo las funciones avanzadas de un gateway.
- Atributos: favorece Performance, Seguridad (superficie reducida) y Modificabilidad; costo bajo de Complejidad.

| Alternativa | Performance | Seguridad (superficie) | Modificabilidad | Complejidad |
|---|---|---|---|---|
| A. Acceso directo | Baja | Baja | Baja | Muy baja |
| B. API Gateway (Kong) | Alta | Alta | Alta | Alta |
| C. Nginx (elegida) | Alta | Media-alta | Alta | Baja |

## Decisión

Nosotros usaremos Nginx como único punto de entrada: `/auth` hacia Identity Service, `/api` hacia el *pool* de instancias de la SmartParking API con reparto round-robin y `/` para la SPA. Las bases, Redis, RabbitMQ y Elasticsearch quedarán en una red interna sin exposición. Nginx no inspeccionará el JWT.

## Justificación

- Táctica de Performance *múltiples copias de cómputos* (Gestionar recursos): N instancias de la API detrás del balanceador.
- Táctica de Seguridad *limitar acceso* y de Integrabilidad *restringir caminos de comunicación*: solo Nginx es accesible desde fuera; el resto se comunica por red interna.
- El JWT se valida en la API y no en Nginx porque el control de rol y pertenencia (`AuthorizationGuard`, `OwnershipResolver`) debe vivir junto a la lógica de negocio y necesita los claims; validar en dos lugares duplicaría la lógica y la sacaría del código versionado y testeado.
- Se descartó A por no cumplir Performance ni Seguridad y B por una complejidad que no se justifica para el alcance.

## Estado

Aceptado

## Consecuencias

**Positivas**

- Escalar la API es agregar instancias sin cambiar a los clientes.
- Superficie de exposición mínima; ruteo centralizado.
- Una sola URL base para SPA, autenticación y API.

**Negativas**

- Nginx es un punto único de falla en el prototipo (en producción requeriría redundancia).
- Un salto de red adicional por pedido.
- Sin TLS en el prototipo local (HTTP en el puerto 8080); TLS queda documentado para producción.

Relacionado con: ADR-03, ADR-06, ADR-09, ADR-10
