# ADR-03: Autenticación con Identity Service propio y JWT firmado con RS256

## Contexto

El enunciado exige un componente de autenticación propio con login, emisión y validación de tokens. La API debe autenticar y autorizar a cada actor (ADMIN o CLIENTE) en cada pedido. Fuerzas en tensión:

- **Seguridad**: solo Identity puede emitir tokens válidos; la API debe poder detectar tokens manipulados o vencidos.
- **Performance**: 500 req/s con p95 < 300 ms; no se puede sumar un viaje de red a Identity por cada pedido.
- **Modificabilidad**: Identity debe poder evolucionar sin que la API conozca sus secretos ni su base.
- **Restricción del enunciado**: autenticación propia (no se admite un proveedor externo).

## Alternativas consideradas

**A. JWT firmado con HS256 (secreto compartido).**

- Pros: simple; sin gestión de par de claves.
- Contras: la API conoce el secreto y por lo tanto podría fabricar tokens; si se filtra en cualquier servicio, se compromete todo el sistema.
- Atributos: favorece simplicidad y velocidad; perjudica Seguridad.

**B. Tokens opacos / sesión con introspección en cada pedido.**

- Pros: revocación inmediata; el contenido del token no es visible.
- Contras: cada pedido consulta a Identity (latencia y acoplamiento de disponibilidad); Identity pasa a ser cuello de botella para 500 req/s.
- Atributos: favorece Seguridad (revocación); perjudica Performance y Disponibilidad.

**C. Proveedor externo (p. ej. Keycloak).**

- Pros: funcionalidades completas listas para usar.
- Contras: el enunciado exige autenticación propia; añade infraestructura pesada y oculta lo que se debe diseñar.
- Atributos: favorece Seguridad por madurez; descartada por restricción del enunciado.

**D. JWT RS256 emitido por un Identity Service propio, con JWKS (elegida).** Identity firma con la clave privada y publica la pública en `/.well-known/jwks.json`; la API verifica localmente.

- Pros: la API solo conoce la clave pública y no puede fabricar tokens; la validación es local (sin llamadas por pedido); se apoya en un estándar abierto.
- Contras: no hay revocación inmediata (el token vale hasta `exp`); se debe gestionar un par de claves y su rotación; token de 1 h sin *refresh*.
- Atributos: favorece Seguridad y Performance; perjudica algo la capacidad de revocar.

| Alternativa | Seguridad | Performance | Revocación | Cumple enunciado |
|---|---|---|---|---|
| A. HS256 | Media | Alta | Baja | Sí |
| B. Opaco + introspección | Alta | Baja | Alta | Sí |
| C. Keycloak | Alta | Media | Alta | No |
| D. JWT RS256 + JWKS (elegida) | Alta | Alta | Baja | Sí |

## Decisión

Nosotros usaremos un Identity Service propio que autentica con email y contraseña (hash `bcrypt`) y emite un `accessToken` JWT firmado con RS256 (claims `sub` = identityUserId, `roles`, `iss`, `exp` = 1 h). La clave pública se publicará como JWKS. El middleware `JwtAuthMiddleware` de la API verificará firma, vigencia y emisor de forma local, y luego `AuthorizationGuard` y `OwnershipResolver` resolverán rol y pertenencia.

## Justificación

- Tácticas de Seguridad: *autenticar actores* (login en Identity), *autorizar actores* (rol y pertenencia en la API) y *verificar integridad de los mensajes* (firma del token). JWT y RS256 son las herramientas que las implementan, no las tácticas.
- Táctica de Performance *reducir overhead*: la validación local evita un viaje a Identity por pedido.
- La asimetría de claves limita el daño: un compromiso de la API no permite emitir tokens.
- Se descartó A por seguridad, B por su costo en Performance y disponibilidad, y C por el enunciado.

## Estado

Aceptado

## Consecuencias

**Positivas**

- La API valida sin depender de la disponibilidad de Identity en cada pedido (solo para obtener y refrescar el JWKS, que se cachea).
- Identity es el único emisor; la API no puede falsificar tokens.
- Contrato abierto y estándar (JWT/JWKS).

**Negativas**

- Sin revocación inmediata: un token robado es válido hasta su expiración; se acota con vigencia de 1 h. El *refresh token* y una lista de revocación quedan como mejora futura.
- Hay que custodiar la clave privada (volumen / archivo montado) y planificar su rotación.
- El payload del JWT es legible (no cifrado): no debe contener datos sensibles.

Relacionado con: ADR-04, ADR-07, ADR-01
