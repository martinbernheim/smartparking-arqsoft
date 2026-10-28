# ADR-10: Despliegue y ejecución con Docker Compose

## Contexto

El prototipo tiene muchos componentes (servicios propios, bases, caché, broker, Elasticsearch, Nginx) que deben poder levantarse de forma consistente para demostrar el diseño y ejecutar pruebas. Fuerzas en tensión:

- **Reproducibilidad / Deployability**: un tercero debe poder ejecutar el sistema completo con pocos pasos.
- **Testeabilidad**: las pruebas de integración y de carga requieren el entorno completo.
- **Recursos**: el entorno de desarrollo es una sola máquina.
- **Complejidad**: no sobredimensionar la infraestructura.

## Alternativas consideradas

**A. Ejecución local sin contenedores.**

- Pros: sin herramienta adicional; depuración directa.
- Contras: requiere instalar y configurar cada motor a mano; resultados dependientes de la máquina; difícil de reproducir.
- Atributos: favorece la depuración; perjudica Reproducibilidad y Testeabilidad.

**B. Kubernetes.**

- Pros: orquestación, autoescalado y despliegue de nivel productivo.
- Contras: complejidad y consumo desproporcionados para el alcance; curva de aprendizaje alta.
- Atributos: favorece Disponibilidad y escalado; perjudica Complejidad.

**C. Docker Compose con perfiles (elegida).**

- Pros: un archivo describe todo el sistema; comando único de arranque; perfiles para piezas opcionales; réplicas de la API con un parámetro.
- Contras: orientado a un solo host; sin autoescalado ni alta disponibilidad real.
- Atributos: favorece Reproducibilidad, Testeabilidad y Deployability; perjudica el escalado productivo.

| Alternativa | Reproducibilidad | Testeabilidad | Complejidad |
|---|---|---|---|
| A. Local sin contenedores | Baja | Media | Baja |
| B. Kubernetes | Alta | Alta | Alta |
| C. Docker Compose (elegida) | Alta | Alta | Baja-media |

## Decisión

Nosotros usaremos Docker Compose para definir y ejecutar todo el sistema con `docker compose up`. Los perfiles `replica` (réplica de lectura de PostgreSQL) y `observability` (Kibana) activarán las piezas opcionales. Habrá dos redes: una pública, solo para Nginx, y una interna para el resto; y se usarán *healthchecks* con dependencias por salud.

## Justificación

- Reproducibilidad y Deployability: el mismo archivo levanta el sistema en cualquier máquina con Docker.
- Integrabilidad (*restringir caminos de comunicación*) y Seguridad (*limitar acceso*): la red interna aísla bases, caché y broker; solo Nginx publica un puerto (ADR-07).
- Testeabilidad: el entorno completo habilita las pruebas de integración y de carga que validan los escenarios.
- Se descartó A por irreproducible y B por complejidad desproporcionada; Kubernetes queda como evolución productiva.

## Estado

Aceptado

## Consecuencias

**Positivas**

- Arranque con un comando y entorno idéntico para todo el equipo.
- Piezas opcionales activables sin tocar el resto.
- Base para las pruebas de integración y de carga.

**Negativas**

- Consumo importante de memoria en una sola máquina (Elasticsearch, PostgreSQL, MongoDB, RabbitMQ y varias instancias de la API).
- Sin autoescalado ni alta disponibilidad real: no representa un entorno productivo.
- Hay que mantener sincronizados el archivo de Compose, las variables de entorno y los *healthchecks*.

Relacionado con: ADR-05, ADR-07, ADR-08
