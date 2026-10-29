# Pruebas de carga (k6)

## Escenario 1 – Consultas bajo carga

`k6-consultas.js`: hace login como `cliente1` y `admin` (vía Nginx) y mezcla
`GET /api/reservas/mias` y `GET /api/admin/reservas?estado=ACTIVA`.
Carga: `constant-arrival-rate` de 500 req/s (por defecto 60 s) con thresholds
`http_req_duration p(95)<300` ms y `http_req_failed rate<0.01`.

Prerrequisito: `docker compose up -d --build` (todo accesible en `http://localhost:8080`).

```bash
# Linux / macOS / Git Bash (red del host)
docker run --rm -i --network host grafana/k6 run - < load-tests/k6-consultas.js

# Windows / Docker Desktop (no hay --network host real): usar host.docker.internal
docker run --rm -i -e BASE_URL=http://host.docker.internal:8080 grafana/k6 run - < load-tests/k6-consultas.js
```

Variables (`-e NOMBRE=valor`): `BASE_URL` (def. `http://localhost:8080`), `RATE` (500), `DURATION` (60s),
`PRE_VUS` (200), `MAX_VUS` (1000), `CLIENT_EMAIL`, `CLIENT_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

Prueba rápida: `-e RATE=50 -e DURATION=15s`.
