# ADR-02: Stack de implementación de los servicios backend

## Contexto

El sistema se compone de tres procesos backend (Identity Service, SmartParking API, Audit Log Service) que comparten contratos (DTOs) y deben ser construidos por el equipo en el plazo del curso. Fuerzas en tensión:

- **Performance**: la API debe sostener 500 req/s de consulta con p95 < 300 ms; la mayor parte del tiempo se espera I/O (BD, caché, broker).
- **Modificabilidad / Integrabilidad**: los servicios intercambian mensajes y llamadas REST con contratos explícitos (EventoAuditoriaDTO, LoginRequest, etc.); un cambio de contrato no debe pasar inadvertido.
- **Complejidad / conocimiento del equipo**: el equipo conoce el stack visto en el curso y debe poder defender cada pieza.

## Alternativas consideradas

**A. Java + Spring Boot.**

- Pros: ecosistema maduro, tipado fuerte, buen soporte de seguridad y de acceso a datos.
- Contras: no fue el stack trabajado en el curso; mayor consumo de memoria y arranque más lento de cada contenedor; el equipo tendría que aprender el framework además de diseñar.
- Atributos: favorece Integrabilidad (tipado) y Seguridad; perjudica Complejidad y tiempo de entrega.

**B. .NET (ASP.NET Core).**

- Pros: buen rendimiento y tipado fuerte; herramientas de primer nivel.
- Contras: tampoco es el stack del curso; lenguaje distinto del de la SPA (el contrato no se comparte); curva de aprendizaje para el equipo.
- Atributos: favorece Performance; perjudica Complejidad y reutilización de contratos.

**C. Node.js 22 + TypeScript + Express (elegida).**

- Pros: stack visto en el curso; un solo lenguaje en servicios y SPA; E/S no bloqueante adecuada para cargas dominadas por esperas; tipos compartidos en un paquete `contracts/`.
- Contras: ejecución en un único hilo (las tareas de CPU intensivas bloquean el *event loop*); Express aporta poca estructura por sí mismo (se impone por convención: *package by feature* + capas).
- Atributos: favorece Performance (concurrencia), Modificabilidad e Integrabilidad (contratos tipados); perjudica algo la robustez estructural.

| Alternativa | Performance (E/S) | Integrabilidad (contratos) | Complejidad para el equipo |
|---|---|---|---|
| A. Spring Boot | Alta | Alta | Alta |
| B. .NET | Alta | Alta | Alta |
| C. Node.js + TS + Express (elegida) | Alta (E/S) | Alta (tipos compartidos) | Baja |

## Decisión

Nosotros usaremos Node.js 22 (LTS) con TypeScript y Express para Identity Service, SmartParking API y Audit Log Service. Los DTOs se definirán una única vez en el paquete local `contracts/` (npm workspaces) y los pedidos se validarán en el borde con `zod`.

## Justificación

- La E/S no bloqueante del *event loop* permite atender muchas consultas concurrentes mientras se espera a la BD o a Redis (táctica *introducir concurrencia*, Performance → Gestionar recursos).
- El paquete `contracts/` con tipos y esquemas `zod` fija el contrato entre componentes en un solo lugar (tácticas *adherir a estándares* y *restringir dependencias*, Integrabilidad y Modificabilidad): un cambio de DTO falla en compilación en todos los consumidores.
- Node.js/Express no es una táctica: es la herramienta que implementa las anteriores.
- Se descartó A y B porque no aportan una ventaja de atributo que compense el costo de salir del stack del curso y de usar lenguajes distintos entre servicios y SPA.

## Estado

Aceptado

## Consecuencias

**Positivas**

- Un único lenguaje y toolchain (build, test con `vitest`) en todo el sistema.
- Contratos compartidos y verificados en compilación.
- Imágenes livianas y arranque rápido de los contenedores.

**Negativas**

- Un hilo por proceso: la escala depende de múltiples instancias (ver ADR-07) y se debe evitar trabajo de CPU en el camino de pedido.
- Menos estructura impuesta que en un framework opinado; depende de respetar las convenciones del equipo.
- Tipado solo en compilación: los datos externos requieren validación en ejecución (`zod`).

Relacionado con: ADR-01, ADR-07, ADR-09
