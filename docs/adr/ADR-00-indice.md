# Registro de decisiones de arquitectura (ADR) – SmartParking

| N | Título | Estado | Atributos | Táctica principal |
|---|---|---|---|---|
| [ADR-01](ADR-01-comunicacion-log.md) | Comunicación al registro de eventos (RabbitMQ pub/sub) | Aceptado | Performance, Modificabilidad, Disponibilidad | Limitar la respuesta a eventos; uso de intermediario |
| [ADR-02](ADR-02-stack-backend.md) | Stack backend: Node.js 22 + TypeScript + Express | Aceptado | Performance, Integrabilidad | Introducir concurrencia; adherir a estándares |
| [ADR-03](ADR-03-autenticacion-jwt-rs256.md) | Autenticación con Identity Service y JWT RS256 | Aceptado | Seguridad, Performance | Autenticar y autorizar actores; verificar integridad de mensajes |
| [ADR-04](ADR-04-almacen-identidad-mongodb.md) | Almacén de identidad en MongoDB | Aceptado | Seguridad, Modificabilidad | Limitar acceso; restringir dependencias |
| [ADR-05](ADR-05-persistencia-operacional-postgresql-prisma.md) | Persistencia operacional: PostgreSQL + Prisma | Aceptado | Integridad, Performance, Modificabilidad | Múltiples copias de datos; encapsular |
| [ADR-06](ADR-06-cache-redis.md) | Caché de consultas con Redis | Aceptado | Performance | Múltiples copias de datos |
| [ADR-07](ADR-07-entrada-nginx.md) | Entrada única con Nginx (proxy y balanceo) | Aceptado | Performance, Seguridad | Múltiples copias de cómputos; restringir caminos de comunicación |
| [ADR-08](ADR-08-almacen-auditoria-elasticsearch.md) | Almacén de auditoría en Elasticsearch | Aceptado | Seguridad | Mantener audit trail |
| [ADR-09](ADR-09-frontend-spa-react.md) | Cliente web: SPA React + Vite + TypeScript | Aceptado | Usabilidad, Modificabilidad | Reducir acoplamiento |
| [ADR-10](ADR-10-despliegue-docker-compose.md) | Despliegue con Docker Compose | Aceptado | Deployability, Testeabilidad | Restringir caminos de comunicación (red interna) |

Nota: JWT, RabbitMQ, Redis, Nginx, etc. son herramientas; cada ADR indica qué táctica implementa.
