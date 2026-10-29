# Guía de uso – SmartParking

Guía para levantar, usar y presentar el sistema. Para el guion de la defensa ver [DEMO.md](DEMO.md).

## 1. Requisitos

| Herramienta | Para qué | Cómo verificar |
|---|---|---|
| Docker Desktop (con Compose v2) | Levantar todo el sistema | `docker --version` y `docker compose version` |
| Git Bash | Correr los scripts (`.sh`) en Windows | Viene con Git for Windows |
| OpenSSL | Generar las claves RSA del JWT | `openssl version` (incluido en Git Bash) |
| Node.js 22 *(opcional)* | Correr tests y builds fuera de Docker | `node -v` |
| `jq` *(opcional)* | Formatear JSON en los comandos de la demo | `winget install jqlang.jq` |
| Python 3 + pandoc + Chrome *(opcional)* | Regenerar el PDF de entrega | `python scripts/build-pdf.py` |

Docker Desktop debe tener al menos 4 GB de memoria asignada (Elasticsearch usa ~1 GB).

## 2. Primer arranque

Desde la raíz del repositorio, en Git Bash:

```bash
bash scripts/generate-keys.sh    # crea keys/private.pem y keys/public.pem (solo la primera vez)
cp .env.example .env             # configuración local (solo la primera vez)
docker compose up -d --build     # construye y levanta todo
docker compose ps                # esperar a que los servicios estén "healthy" (~1–2 min)
```

Al arrancar, el servicio `api-migrate` aplica las migraciones de PostgreSQL, carga los datos demo y termina (estado `Exited (0)` es lo esperado).

## 3. URLs

| URL | Qué es |
|---|---|
| http://localhost:8080 | Aplicación web (SPA) — entrada única por Nginx |
| http://localhost:8080/api/docs/ | Documentación interactiva de la API (Swagger) |
| http://localhost:15672 | Consola de RabbitMQ (usuario `guest`, clave `guest`) |
| http://localhost:9200/audit-events/_search?pretty | Eventos de auditoría en Elasticsearch |
| http://localhost:5601 | Kibana (opcional: `docker compose --profile observability up -d kibana`) |

## 4. Usuarios de prueba

| Rol | Email | Contraseña | Qué puede hacer |
|---|---|---|---|
| ADMIN | `admin@smartparking.local` | `Admin123!` | CRUD de clientes, ver/gestionar todas las reservas, ranking CQRS |
| CLIENTE | `cliente1@smartparking.local` | `Cliente123!` | Sus vehículos y sus reservas (María Fernández) |
| CLIENTE | `cliente2@smartparking.local` | `Cliente123!` | Sus vehículos y sus reservas (Santiago Rodríguez) |

Los valores exactos están en `.env.example` (variables `SEED_*`).

## 5. Qué probar en la aplicación

**Como cliente** (`cliente1`):
1. *Mis reservas*: lista con filtros Todas / Activas / Canceladas.
2. *Nueva reserva*: elegir vehículo y horario. Si se solapa con otra reserva activa del mismo vehículo, aparece "El vehículo ya tiene una reserva activa en ese horario".
3. *Modificar* o *Cancelar* una reserva (cancelar no la borra: cambia el estado a CANCELADA).
4. *Mis vehículos*: alta, edición y baja (no se puede borrar un vehículo con reservas activas).

**Como administrador** (`admin`):
1. *Reservas*: consulta global con filtros por cliente, estado y fechas; KPIs y paginación.
2. Panel *Ranking (modelo de lectura CQRS)*: vista derivada de los eventos, se actualiza segundos después de cada cambio.
3. *Clientes*: alta de cliente (crea también su usuario en Identity, con la contraseña inicial que se indique), edición y baja. El cliente nuevo puede iniciar sesión enseguida.

## 6. Qué pasa por detrás (para explicar)

| Acción | Recorrido |
|---|---|
| Login | SPA → Nginx `/auth` → Identity (valida con bcrypt contra MongoDB) → JWT RS256 |
| Cualquier pedido a la API | Nginx `/api` → una de las 2 réplicas → `JwtAuthMiddleware` verifica firma, `exp` e `iss` con la clave pública → `AuthorizationGuard` (rol) / `OwnershipResolver` (pertenencia) |
| Consultas de reservas | `ReservaQueryService` → caché Redis (30 s) o réplica de lectura. Encabezados `X-Cache: HIT/MISS` y `X-Upstream-Instance` |
| Alta / modificación / cancelación | `ReservaCommandService` → PostgreSQL primaria → evento `reserva.creada` (etc.) al exchange `smartparking.events` |
| Eventos | RabbitMQ (topic) → cola `audit-log` (`#`) → Audit Log Service → Elasticsearch; cola `read-model.reservas` (`reserva.*`, `vehiculo.*`, `cliente.*`) → read-model-service → MongoDB `smartparking_read` |

## 7. Comandos útiles

```bash
docker compose ps                          # estado de los servicios
docker compose logs -f api                 # logs de la API (también: identity-service, audit-service, read-model-service)
docker compose logs api | grep AUDIT       # eventos/errores de publicación de auditoría
docker compose restart api                 # reiniciar un servicio
docker compose stop                        # detener todo (conserva los datos)
docker compose up -d                       # volver a levantar
docker compose down -v && docker compose up -d --build   # BORRA todos los datos y arranca limpio con el seed
```

## 8. Tests, builds y carga

```bash
npm install          # una vez, en la raíz
npm run build        # compila contracts y todos los servicios
npm test             # tests de identity-service, api, audit-service y read-model-service
cd web && npm install && npm run build      # build de la SPA
```

Prueba de carga del Escenario 1 (500 consultas/s, p95 < 300 ms) con k6 en Docker:

```bash
docker run --rm -i -e BASE_URL=http://host.docker.internal:8080 grafana/k6 run - < load-tests/k6-consultas.js
```

En Windows con Docker Desktop la red agrega latencia; los valores medidos en la máquina local son orientativos.

## 9. Documentación del diseño

| Archivo | Contenido |
|---|---|
| [SmartParking_Parte1.pdf](SmartParking_Parte1.pdf) | Entrega de diseño (A1–A4). Se regenera con `python scripts/build-pdf.py` |
| [adr/ADR-00-indice.md](adr/ADR-00-indice.md) | Índice de las 11 decisiones de arquitectura |
| [diagramas/](diagramas/) | Figuras 1–5 (PlantUML + PNG) |
| [DEMO.md](DEMO.md) | Guion de presentación y preguntas probables |
| [PLAN_SmartParking.md](PLAN_SmartParking.md) / [PLAN_Implementacion.md](PLAN_Implementacion.md) | Decisiones y plan de implementación |
| [design/](design/) | Logo, colores y maquetas de pantallas |

## 10. Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `identity-service` no arranca: no encuentra las claves | Correr `bash scripts/generate-keys.sh` y `docker compose up -d` |
| Un servicio queda en `starting` mucho tiempo | Elasticsearch tarda ~1 min; esperar y revisar `docker compose ps` |
| Puerto ocupado (8080, 5672, 15672, 9200…) | Cambiar el puerto correspondiente en `.env` |
| El ranking CQRS no muestra un cambio | Es consistencia eventual: esperar unos segundos y recargar |
| Datos de prueba "sucios" | `docker compose down -v && docker compose up -d --build` |
| Error 401 en la app | El token vence a la hora: volver a iniciar sesión |
