# ADR-09: Cliente web como SPA en React

## Contexto

El prototipo necesita un cliente para demostrar los flujos de login, vehículos, reservas y vista administrativa con filtros. Su impacto arquitectónico es bajo: consume las interfaces públicas `IAuthApi` e `ISmartParkingApi` y no contiene reglas de negocio. Fuerzas en tensión:

- **Usabilidad**: flujos claros y diseño responsive para demostrar el sistema.
- **Modificabilidad**: la interfaz debe poder cambiar sin tocar los servicios.
- **Complejidad / tiempo**: esfuerzo de construcción acotado.

## Alternativas consideradas

**A. HTML y JavaScript sin framework.**

- Pros: sin herramientas de build; muy liviano.
- Contras: manejo manual del estado y de las vistas; difícil de mantener al crecer; sin tipos compartidos con `contracts/`.
- Atributos: favorece simplicidad inicial; perjudica Modificabilidad.

**B. Solo Swagger UI y colección Postman.**

- Pros: esfuerzo mínimo; útil para probar la API.
- Contras: no representa un cliente real ni permite demostrar los flujos de un usuario; peor experiencia de uso.
- Atributos: favorece costo; perjudica Usabilidad.

**C. SPA con React, Vite y TypeScript (elegida).**

- Pros: componentes reutilizables; tipos compartidos con los servicios; build estático servido por Nginx; mismo lenguaje que el backend.
- Contras: añade una cadena de build y dependencias; esfuerzo mayor que A o B.
- Atributos: favorece Usabilidad y Modificabilidad; perjudica algo el tiempo de construcción.

| Alternativa | Usabilidad | Modificabilidad | Esfuerzo |
|---|---|---|---|
| A. HTML/JS plano | Media | Baja | Bajo |
| B. Solo Swagger/Postman | Baja | n/a | Muy bajo |
| C. React + Vite + TS (elegida) | Alta | Alta | Medio |

## Decisión

Nosotros usaremos una SPA con React, Vite y TypeScript, compilada a archivos estáticos y servida por Nginx en `/`, que consumirá `/auth` y `/api` por HTTP. La identidad visual usará la tipografía Plus Jakarta Sans. Swagger UI se mantendrá como herramienta de prueba de la API.

## Justificación

- Modificabilidad (táctica *reducir acoplamiento*, *restringir dependencias*): el cliente solo depende de los contratos HTTP; los servicios no conocen la interfaz.
- Usabilidad: una SPA permite demostrar los flujos reales con una experiencia coherente.
- Se reconoce que esta decisión tiene bajo impacto arquitectónico; se documenta por completitud del stack.
- Se descartó A por mantenibilidad y B por no mostrar los flujos de usuario.

## Estado

Aceptado

## Consecuencias

**Positivas**

- Cliente desacoplado, que reutiliza los tipos de `contracts/`.
- Despliegue estático sin proceso adicional (lo sirve Nginx).

**Negativas**

- Cadena de build adicional y más dependencias a mantener.
- El token queda en el navegador: requiere cuidado frente a XSS.
- Esfuerzo de construcción mayor que las alternativas livianas.

Relacionado con: ADR-02, ADR-07
