# SmartParking – Parte 1 · Plan

## Context
Evaluación grupal de diseño (sin código). Entregar 1 PDF con:
A1 diagrama UML de componentes (45) · A2 dos escenarios de calidad (25) · A3 ADR-01 comunicación con log (25) · A4 coherencia (5).
Todo basado en material del curso (`PAC2/.material-local/`), no inventado.

## Primer paso al salir de plan mode
Copiar este plan a `PAC2/PLAN_SmartParking.md`.

## Decisiones tomadas con el usuario
| Tema | Decisión |
|---|---|
| Identity | Servicio separado, base propia |
| Log (ADR-01) | Cola de mensajes asíncrona (alternativas descartadas: HTTP síncrono, outbox) |
| Stack | Del curso: Node.js + TypeScript + Express, `jsonwebtoken`, PostgreSQL (`pg`), RabbitMQ (`amqplib`), Winston + Elasticsearch/Kibana |
| Storage usuarios | MongoDB (Mongoose) |
| Diagrama | PlantUML |
| Documento | Markdown en PAC2 → PDF |

| Firma JWT | RS256: Identity firma con privada, API verifica con pública (cacheada) |
| Cola | Pub/sub: exchange `smartparking.events` (topic) en RabbitMQ; Audit Log suscripto con cola durable |
| Performance | Réplica de lectura PostgreSQL + caché Redis + N instancias API detrás de LB |
| Log store | Elasticsearch (+ Kibana para consulta) |
| Alta de usuario | Admin crea Cliente → API llama a Identity por `IUserAdmin` (REST interno, solo ADMIN) → crea usuario rol CLIENTE → devuelve id → `Cliente.identityUserId` |
| Estructura API | Package by feature (clientes/, vehiculos/, reservas/) + capas routes→controller→service→repository; auditoría como puerto `IAuditEventPublisher` + adapter RabbitMQ; módulo transversal auth (middleware) |
| No solapamiento | Validación en ReservaService (409) + constraint PostgreSQL `EXCLUDE USING gist (vehiculo_id WITH =, tstzrange(inicio,fin) WITH &&) WHERE estado='ACTIVA'` |
| Acceso BD | Prisma (migración SQL manual para EXCLUDE) |
| Token | accessToken 1 h, sin refresh (mejora futura) |
| Entrada | Nginx reverse proxy único: `/auth` → Identity, `/api` → N instancias API (balanceo). JWT se valida en la API, no en Nginx |
| Caché | Redis: consultas de reservas (propias y globales con filtros), TTL 30 s + invalidación en alta/modif/cancelación |
| Falla de RabbitMQ | CRUD se confirma igual; publisher confirms + reintentos con backoff; si falla, error a log técnico Winston. Declarado como consecuencia negativa en ADR; Outbox como mejora |

Defaults menores (sin preguntar):
- Roles: solo `ADMIN` y `CLIENTE`. Primer ADMIN creado por seed en Identity.
- Cancelar = cambiar estado a CANCELADA (no se borra). Borrar cliente/vehículo con reservas activas → rechazo 409.
- Vista de despliegue simple (Docker Compose) como figura opcional; no la pide la rúbrica.
- Comunicación interna Identity↔API (`IUserAdmin`) protegida con token de servicio/rol ADMIN.

Implementación: una vez cerrado el diseño, se programa siguiendo estas decisiones.

## Modo de ejecución (pedido del usuario)
Yo orquesto y reviso; la redacción la hacen subagentes `model: sonnet` con briefs cerrados (decisiones + convenciones de este plan). Después de cada entrega, reviso contra enunciado y rúbrica y pido correcciones puntuales. Sin agentes de exploración extra: el material ya está resumido acá.
- Agente 1: `diagramas/componentes.puml` + render.
- Agente 2 (tras aprobar diagrama): `SmartParking_Parte1.md` (A1 texto, A2, A3, A4).

## Orden de ejecución
1. Copiar plan a `PAC2/PLAN_SmartParking.md`.
2. Escribir `diagramas/componentes.puml` y renderizar PNG (revisar con usuario).
3. Escribir `SmartParking_Parte1.md`: A1 catálogo + interfaces/DTOs + dónde se valida JWT; A2; A3; A4 trazabilidad.
4. Revisar contra la rúbrica con el usuario; exportar PDF.

## Convenciones a respetar (fuente: material)
- Táctica siempre como **atributo → categoría → táctica → ubicación (componente/conector) → tecnología**. JWT es herramienta, no táctica (digest clase 17).
- Escenario en 6 partes: Fuente, Estímulo, Artefacto, Entorno, Respuesta, Medida de respuesta (`teoria/Arquitectura de Software - Ej. Integrador.docx`).
- ADR con plantilla `recursos-documentacion/ADR-template-master/ADR-template_es-ES.md` + sección "Alternativas consideradas" obligatoria, consecuencias positivas y negativas.
- Diagrama: `skinparam componentStyle uml2`, lollipop = provista, `..>` = requerida, estereotipos `<<process>>`, `<<datastore>>`, `<<broker>>`; conectores etiquetados (`HTTPS/REST`, `AMQP`, `SQL`); leyenda de notación; sin flechas dobles (seven-tips).
- Tácticas válidas (nombres del curso):
  - Performance: Gestionar recursos → múltiples copias de cómputos, múltiples copias de datos, introducir concurrencia; Controlar demanda → limitar respuesta a eventos (fire&forget).
  - Modificabilidad: Reducir acoplamiento → encapsular, uso de intermediario, restringir dependencias; Diferir enlaces → configuración / pub-sub.
  - Integrabilidad: Limitar dependencias → encapsular, intermediario, adherir a estándares; Adaptar → configurar comportamiento.
  - Seguridad: Resistir → autenticar actores, autorizar actores, limitar acceso; Detectar → verificar integridad de mensajes (firma JWT); Recuperar → mantener audit trail (log).

## Arquitectura propuesta (A1)
1. **Web Client** `<<webapp>>` – requiere `IAuthApi`, `ISmartParkingApi` (HTTPS, Bearer).
2. **Identity Service** `<<process>>` (Express + jsonwebtoken)
   - provee `IAuthApi` (POST /auth/login: LoginRequest → AuthResponse) y `IJwks`/clave pública.
   - internos: AuthController, CredentialValidator + PasswordHasher (bcrypt), TokenIssuer (claims: sub=identityUserId, roles, exp, iss), UserRepository.
   - → **Identity DB** `<<datastore>>` MongoDB (usuarios, passwordHash, roles).
3. **SmartParking API** `<<process>>` (Express), N instancias detrás de load balancer.
   - JwtAuthMiddleware: verifica firma + exp + iss (local, sin llamar a Identity).
   - Autorización: `requireRole('ADMIN')` (RF1, RF5) + OwnershipResolver: `sub` → Cliente.identityUserId → clienteId (RF2/RF3/RF4).
   - Módulos Clientes / Vehículos / Reservas (regla no solapamiento).
   - Puerto `IAuditEventPublisher` + adapter RabbitMQ (cambiable por config → modificabilidad).
   - → **Operational DB** `<<datastore>>` PostgreSQL (+ réplica lectura / caché según ronda 2).
   - → **Redis** `<<cache>>` para consultas frecuentes; lecturas a réplica, escrituras a primaria.
4. **RabbitMQ** `<<broker>>` – exchange topic `smartparking.events`; mensaje = EventoAuditoriaDTO; publish tras commit, con publisher confirms + retry.
5. **Audit Log Service** `<<process>>` – suscripto (cola durable `audit-log`), persiste en **Elasticsearch** `<<datastore>>` (append-only, consulta con Kibana).

Vínculo identidad↔Cliente: `JWT.sub == Cliente.identityUserId` (dibujar como nota).
Dónde se valida JWT: middleware de la API (firma, vigencia) + capa de autorización (rol/pertenencia).

## A2 escenarios (borrador)
- **Performance**: Fuente usuarios; Estímulo 500 consultas/s; Artefacto SmartParking API + Operational DB; Entorno operación normal; Respuesta procesa todas; Medida p95 < 300 ms. Tácticas: múltiples copias de cómputos (instancias API + LB), múltiples copias de datos (réplica lectura/caché), validación JWT local (reducir overhead), limitar respuesta a eventos (auditoría async). Trade-off: consistencia caché.
- **Modificabilidad/Integrabilidad**: Fuente desarrollador; Estímulo cambiar mecanismo de registro (RabbitMQ → otro / HTTP); Artefacto adapter de auditoría; Entorno diseño/despliegue; Respuesta cambio sin tocar CRUD; Medida 0 líneas modificadas en módulos CRUD, solo 1 adapter + config. Tácticas: encapsular, uso de intermediario, restringir dependencias, diferir enlaces (config), adherir a estándares (contrato EventoAuditoriaDTO).

## A3 ADR-01 (borrador)
Contexto, Alternativas (HTTP síncrono, cola async RabbitMQ, outbox+cola), Decisión cola async, Justificación, Estado Aceptado, Consecuencias (+ desacople, no frena CRUD, tolera caída del log; − latencia del log, broker extra a operar, posible pérdida si falla publish tras commit → mitigar con confirms/retry).

## Archivos a crear en PAC2
- `PLAN_SmartParking.md`
- `diagramas/componentes.puml` (+ PNG/SVG exportado)
- `SmartParking_Parte1.md` (A1 catálogo + interfaces, A2, A3, A4 trazabilidad RF ↔ componente)
- Nota de uso de IA (exigido por `Condiciones de uso de IA en Obligatorios.pdf`).

## Verification
- Render PlantUML sin errores (plantuml.jar o servidor web).
- Checklist rúbrica: auth propio con login/emisión/validación JWT; Identity DB separada; vínculo sub↔identityUserId; rol + pertenencia; log separado; escenarios con medida numérica; tácticas con atributo→categoría→táctica→ubicación; ADR con ≥2 alternativas y consecuencias −/+; sin contradicciones.

## Justificación de cada decisión (para defender)
1. **Identity como servicio separado**: el enunciado exige auth propio y usuarios en otra base; separado se ve la responsabilidad y escala solo. Táctica: Seguridad/Resistir/autenticar actores; Modificabilidad/aumentar cohesión.
2. **Usuarios en MongoDB**: otra tecnología y servidor, separación evidente; ejemplo del curso. Se guarda hash de contraseña, nunca en Cliente.
3. **Stack del curso**: visto en clase, justificable y reutilizable en la implementación.
4. **RS256**: Identity firma con privada, API verifica con pública; la API no puede fabricar tokens. Táctica: Detectar ataques/verificar integridad de mensajes (JWT es herramienta).
5. **JWT validado en middleware de la API**: firma, vigencia, emisor localmente (sin llamar a Identity en cada request → performance); luego rol/pertenencia. Táctica: autorizar actores.
6. **"Mis reservas" desde el token**: sub == Cliente.identityUserId; nunca clienteId del navegador. Táctica: autorizar actores, limitar acceso.
7. **Token 1 h sin refresh**: el enunciado solo pide accessToken + expiresIn; refresh como mejora.
8. **Admin crea Cliente + usuario** vía IUserAdmin: RF1 es del admin; el vínculo nace en el alta.
9. **Cola async RabbitMQ (ADR-01)**: CRUD no espera al log; si el log cae, el negocio sigue. Descartadas: HTTP directo (acopla, latencia), Outbox (más complejo). Táctica: uso de intermediario; limitar respuesta a eventos.
10. **Pub/sub**: se pueden sumar suscriptores sin tocar la API. Táctica: diferir enlaces.
11. **Elasticsearch para el log**: visto en clase, append-only + búsqueda, Kibana. Táctica: mantener audit trail.
12. **RabbitMQ caído → CRUD sigue + reintentos**: prioriza negocio; consecuencia negativa declarada (posible pérdida); Outbox como mejora.
13. **Nginx + N instancias API**: múltiples copias de cómputos; restringir caminos de comunicación.
14. **Réplica lectura + Redis**: múltiples copias de datos.
15. **Caché TTL 30 s + invalidación**: velocidad sin mostrar datos viejos.
16. **Feature + capas, puerto de auditoría, EXCLUDE en PostgreSQL, Prisma**: Layers + Package by Feature; encapsular / restringir dependencias (escenario de modificabilidad); integridad ante concurrencia garantizada por la BD; ORM visto en clase.
