# SmartParking — Diseño visual de la SPA

Referencia estática (HTML + `tokens.css`) para portar a React + Vite + TypeScript. Abrir `index.html` para la galería.

## Principios
- Claro, limpio, SaaS moderno: fondo `#F7F8FC`, tarjetas blancas con radio 16px, bordes sutiles y sombras suaves.
- Un solo acento: gradiente azul → violeta (`#2563EB → #7C3AED`) para acciones primarias, marca y estados activos.
- Contraste AA: texto `#0F1325` / `#4A5169`; botón primario y badges verificados sobre fondo.
- Estados siempre con texto + punto de color (no solo color).
- Mobile first en lo esencial: a ≤860px el sidebar pasa a pestañas horizontales; a ≤640px las cards se apilan y los modales salen desde abajo.
- Sin dependencias: iconos SVG inline (trazos estilo Lucide), JS mínimo (menú y modal).

## Tipografía
Plus Jakarta Sans (Google Fonts), pesos 400/500/600/700/800. Escala: 12 / 13.5 / 15 / 17 / 20 / 24 / 30 / 40 px.

## Paleta
| Token | Hex |
|---|---|
| Azul 50 / 100 / 200 / 300 / 400 | `#EFF4FF` `#DCE7FE` `#BDD0FD` `#92B0FB` `#5F89F6` |
| Azul 500 / **600** / 700 / 800 | `#3B68F0` **`#2563EB`** `#1D4FD0` `#1E40A8` |
| Violeta 50 / 100 / 200 / 300 / 400 | `#F5F0FF` `#EBE1FF` `#D9C7FE` `#C0A0FC` `#A175F8` |
| Violeta 500 / **600** / 700 / 800 | `#8B55F4` **`#7C3AED`** `#6527CF` `#5320A8` |
| Neutros 0 / 25 / 50 / 100 / 200 | `#FFFFFF` `#F7F8FC` `#F1F3F9` `#E7EAF3` `#D8DCE9` |
| Neutros 400 / 500 / 600 / 800 / 900 | `#8A92AB` `#646C86` `#4A5169` `#1F2437` `#0F1325` |
| ACTIVA (verde) | texto `#0C6E3E` sobre `#E8F8EF`, punto `#18A862` |
| CANCELADA (gris) | texto `#4A5169` sobre `#F1F3F9`, punto `#8A92AB` |
| Peligro | `#D1303B` / texto `#AD222C` sobre `#FDECEC` |
| Advertencia | `#B45309` sobre `#FFF6E0` |

Radios: 8 / 10 / 14 / 16 px. Espaciado base 4px. Todo está como variables CSS en `tokens.css`. Modo oscuro: no incluido (se prioriza una identidad clara consistente).

## Logo
`logo.svg` (isotipo + wordmark), `logo-mark.svg` (cuadrado, legible a 16/32 px, usable como favicon), `logo-mark-white.svg` (monocromo para fondos de gradiente). Concepto: pin de ubicación con una "P" de parking.

## Componentes (clases en `tokens.css`)
`.btn` (`-primary`, `-secondary`, `-ghost`, `-danger`, `-sm`), `.input`, `.select`, `.label`, `.field`, `.error-text`, `.alert`, `.card`, `.badge` (`-activa`, `-cancelada`, `-admin`, `-cliente`), `.chip`, `.plate` (matrícula), `.table`, `.pagination`, `.navbar`, `.sidebar`/`.nav-link`, `.kpi`, `.empty`, `.modal`/`.drawer`/`.overlay`, `.toast`, `.reserva`, `.vehiculo`.

## Pantallas ↔ requisitos
| Pantalla | Requisito |
|---|---|
| `01-login.html` — email + contraseña, error 401 | Autenticación (Identity, `IAuthApi`); no es un RF numerado |
| `06-admin-clientes.html` — CRUD de clientes, contraseña inicial a Identity | RF1 CRUD de clientes (ADMIN) |
| `03-cliente-vehiculos.html` — grilla + modal alta/edición | RF2 CRUD de vehículos (CLIENTE propios / ADMIN) |
| `04-nueva-reserva.html` — crear/modificar; solapamiento → 409 | RF3 Crear, modificar, cancelar y consultar reservas |
| `02-cliente-reservas.html` — mis reservas, cancelar | RF4 Consulta de reservas propias (cliente desde el JWT) |
| `05-admin-reservas.html` — filtros cliente/estado/desde/hasta, KPIs, paginación | RF5 Consulta global con filtros (ADMIN) |

## Notas para portar a React
- Componentes sugeridos: `AppShell`, `Navbar`, `Sidebar`, `ReservaCard`, `EstadoBadge`, `VehiculoCard`, `FiltroReservas`, `DataTable`, `Modal`, `Toast`; extras: `Plate`, `KpiTile`, `Pagination`, `EmptyState`, `FormField`.
- Importar `tokens.css` una vez (global) y reutilizar las clases; o migrar las variables a CSS Modules.
- `EstadoBadge` recibe `estado: "ACTIVA" | "CANCELADA"` y mapea a `.badge-activa` / `.badge-cancelada`.
- Mostrar el menú/ítems del sidebar según el rol del JWT (`CLIENTE` vs `ADMIN`); redirigir al login ante 401.
- Errores del backend: 409 → mensaje inline en el formulario de reserva ("El vehículo ya tiene una reserva activa en ese horario"); 400/422 → errores por campo; otros → `Toast`.
- Usar `<input type="datetime-local">` y convertir a ISO-8601; mostrar fechas con `Intl.DateTimeFormat("es-UY")`.
- Modal/drawer: manejar foco, `Esc` y `aria-modal` (ya modelados en el HTML); considerar Radix Dialog.
- Los iconos son `<symbol>` de un sprite: pasar a un componente `Icon` o a `lucide-react`.
- Los HTML finales se generaron desde plantillas con un sprite y cabecera compartidos; en React eso queda en `AppShell`.

## Ajustes pendientes al portar a React (H6)

- Login: usar las credenciales demo reales del seed (`admin@smartparking.local`, `cliente1@smartparking.local`) y quitar "¿Olvidaste tu contraseña?" (fuera de alcance).
- Admin reservas: la columna de acciones se corta a 1440 px; mover acciones a un menú o reducir columnas.
