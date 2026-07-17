# Handoff: Rediseño de FinanceApp (web)

## Resumen

Rediseño completo de la app web de finanzas personales **FinanceApp**: panel,
cuentas y su detalle, movimientos, cuotas, deudas, ahorros, inversiones,
importar, perfil y login/registro. El prototipo añade jerarquía visual,
visualizaciones de datos (donut, sparklines, evolución de saldo), tarjetas
"wallet", tema claro/oscuro y modales de acción que la app actual no tiene.

Idioma: **español (registro tú)**. Moneda: **multimoneda** (CLP principal,
USD, EUR). Datos de ejemplo con sabor chileno.

## Sobre los archivos de diseño

Los archivos en `prototypes/` son **referencias de diseño hechas en HTML**
(prototipos que muestran el aspecto y el comportamiento deseados), **no código
de producción para copiar y pegar**. Usan estilos en línea y un runtime propio
(`support.js`) solo para el prototipo.

La tarea es **recrear estos diseños en el entorno real de la app**
(`FinanceApp/apps/web`: React + TypeScript + Vite + Tailwind), usando sus
patrones y librerías ya establecidos — **no** servir el HTML directamente.

- `FinanceApp.dc.html` — **app completa navegable** (fuente de verdad del rediseño).
- `Cuentas — 3 diseños.dc.html` — exploración de Cuentas (la dirección elegida ya está en `FinanceApp.dc.html`).
- `Perfil — 3 opciones.dc.html` — exploración de Perfil (la opción elegida ya está en `FinanceApp.dc.html`).
- `Panel — 3 direcciones.dc.html` — exploración del Panel (referencia histórica).

> Para ver un prototipo: ábrelo en un navegador. El archivo `support.js` debe
> estar junto a los `.dc.html`.

## Fidelidad

**Alta fidelidad (hifi).** Colores, tipografía, espaciados e interacciones son
los definitivos. Recrear la UI de forma fiel usando los primitivos y el sistema
de tokens existentes del codebase (abajo el mapeo exacto).

## Stack destino (lo que ya existe en el repo)

- **React + TypeScript + Vite**, enrutado por dominios en `apps/web/src/domains/<dominio>/routes`.
- **Tailwind** con tokens como canales HSL en `apps/web/src/styles/index.css`, consumidos en `apps/web/tailwind.config.ts`.
- **Primitivos UI** en `apps/web/src/shared/ui/`: `Card`, `Button`, `Badge`, `Table`, `PageHeader`, `states` (loading/empty/error), etc.
- **i18n** con react-i18next; strings en `apps/web/src/i18n/es.json` (varios todavía en inglés en código — aprovechar para completar el español).
- **Contratos/modelos** en `packages/contracts/src/` (accounts, transactions, installments, debts, savings, investments) — usar esas formas de datos.
- Layout general en `apps/web/src/app/AppLayout.tsx` (sidebar + navegación con lucide-react).

## Design tokens

El prototipo y la app comparten paleta teal; el rediseño **añade el acento
arcilla/coral** y fija **Geist** como tipografía. Define los tokens en
`src/styles/index.css` (mismos canales HSL que ya usas) y mapéalos en Tailwind.

### Colores — modo oscuro (por defecto) / claro

| Rol (token sugerido)     | Oscuro    | Claro     | Uso                                     |
| ------------------------ | --------- | --------- | --------------------------------------- |
| `--bg` (fondo app)       | `#0b1518` | `#f3f6f6` | fondo general                           |
| `--surface` (card/panel) | `#0f1e21` | `#ffffff` | tarjetas, paneles                       |
| `--surface-2`            | `#13242a` | `#ffffff` | toasts, encabezados de grupo            |
| `--border`               | `#1e2e32` | `#dce7e8` | bordes 1px                              |
| `--border-2`             | `#283c41` | `#cbdadc` | bordes de inputs/botones secundarios    |
| `--text`                 | `#e6eded` | `#13242a` | texto principal                         |
| `--text-mut`             | `#8aa0a2` | `#56696d` | texto secundario                        |
| `--text-dim`             | `#7d9295` | `#76898d` | texto terciario                         |
| `--primary` (marca)      | `#66A5AD` | `#07575B` | acción primaria, activo                 |
| `--primary-ink`          | `#08181b` | `#ffffff` | texto sobre primary                     |
| `--brand`                | `#07575B` | `#07575B` | logo, degradados                        |
| `--accent` (arcilla)     | `#F4A261` | `#E76F51` | acción destacada (+ Movimiento), gastos |
| `--accent-ink`           | `#2b1908` | `#ffffff` | texto sobre accent                      |
| `--success`              | `#46b483` | `#1f8a5b` | ingresos, positivos                     |
| `--danger`               | `#e08a8a` | `#c2453f` | gastos negativos, eliminar              |
| `--info`                 | `#5aa9e6` | `#2a7fb8` | EUR / categorías                        |
| `--chip`                 | `#1c2c30` | `#eef3f3` | pills, iconos en caja                   |
| `--track`                | `#1c2c30` | `#e6eded` | fondo de barras de progreso             |

Colores de categorías (donut/barras): teal `#66A5AD`, arcilla `#F4A261`,
verde `#46b483`, azul `#5aa9e6`, ámbar `#f0b429`, gris `#5b7479`.

### Tipografía

- Familia: **Geist** (variable 100–900); fallback system-ui.
- Escala (px): 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 (base UI ~13) / 16 (títulos sección) / 19–22 (títulos de página) / 26–34 (cifras hero). `font-variant-numeric: tabular-nums` en todas las cifras.
- Pesos: 400 cuerpo, 500 etiquetas, 600 títulos/semibold, 700 cifras grandes.
- `letter-spacing: -.02em` en cifras y títulos grandes.

### Radios, sombras, espaciado

- Radios: 6–9px controles, 11–14px tarjetas/paneles, 16–18px tarjetas wallet/modales, 20px pills.
- Sombras: tarjeta `0 12px 40px rgba(0,0,0,.28)` (oscuro); modales `var(--shadow)`; tarjetas wallet `0 14px 30px rgba(0,0,0,.32)`.
- Espaciado en rejilla de 4px; padding de paneles 14–22px; gap de tarjetas 12–16px.
- Iconografía: **lucide** (1.5–2px stroke, `currentColor`), 14–22px.

## Pantallas / Vistas

> Layout global: sidebar fijo 230px (logo, navegación, toggle de tema, bloque
> de usuario clicable → Perfil) + contenido fluido con `max-width` ~1180px.
> En <860px el sidebar pasa a **drawer** con barra superior (hamburguesa).

### 1. Panel (home) — dirección "Wallet"

- **Propósito**: vista de un vistazo del patrimonio y la cartera.
- **Layout**: 2 columnas (1.25fr / 1fr). Izquierda: patrimonio neto (cifra hero $28.940.500 + delta), título "Tu cartera" y **tarjetas de crédito/débito visuales** (degradado teal para crédito, gris para débito) con número enmascarado, cupo/saldo; tiles "Añadir tarjeta" y "USD+EUR". Derecha: "Flujo del mes" (ingresos/gastos + barra de tasa de ahorro), "Gasto por categoría" (donut + leyenda), "Próximos pagos" (lista con chips de fecha).
- **Acción**: botón accent **+ Movimiento** (abre modal), selector de periodo "Junio 2026".

### 2. Resumen — dirección "Sobrio & denso"

- **Propósito**: panel analítico detallado (vista alternativa al Panel).
- **Layout**: tira de 4 KPIs (patrimonio, ingresos, gastos, tasa de ahorro) con sparklines; 2 columnas con tabla de Cuentas y de Movimientos recientes; derecha: gasto por categoría (barras), próximos vencimientos, metas.

### 3. Cuentas (vista general) — grid "Wallet"

- **Layout**: header + 3 chips de total por moneda (CLP/USD/EUR) + filtros (Todas/Activas/Inactivas) + **grid responsive de tarjetas** (`repeat(auto-fill,minmax(248px,1fr))`).
- **Tarjeta de cuenta**: icono por tipo, pill de tipo/estado (o "42% cupo"), nombre, moneda·máscara, saldo (rojo si negativo), sparkline + variación (o barra de uso de cupo). Clic → detalle. Tile final punteado "Añadir cuenta" → modal Nueva cuenta.

### 4. Cuenta seleccionada (detalle) — denso

- **Layout**: 2 columnas (1fr / 320px). Principal: breadcrumb, header (icono, nombre, estado, botones Editar/Reconciliar), tira de 3 KPIs (saldo actual/inicial/variación), **pestañas** Movimientos / Tarjetas / Información (cambian contenido), tabla de movimientos. Lateral: **tarjeta visual** de la cuenta, lista de Tarjetas (+ Añadir), bloque Detalles y botón "Desactivar cuenta" (danger).

### 5. Movimientos

- KPIs (ingresos/gastos/balance) + filtros segmentados (Todos/Ingresos/Gastos) + selectores (cuenta, categoría, rango de fechas) + tabla con icono por categoría, chips, cuenta, fecha, monto (verde/normal). Botones **Importar** y **+ Movimiento**.

### 6. Cuotas

- 3 tarjetas de plan (descripción, n° cuotas, total, progreso n/total, cuota mensual; borde primary + chip "Vence" en el próximo) + **calendario de pagos** (tabla con estado: Pagada/Próxima/Pendiente). Botón **Nuevo plan**.

### 7. Deudas

- KPIs (te deben / debes / balance neto) + 2 columnas "Te deben" (verde) y "Debes" (rojo) con tarjetas por persona (avatar inicial, monto, vencimiento, acción "Marcar pagada" / "Registrar pago"). Botón **Nueva deuda**.

### 8. Ahorros

- Meta destacada con **anillo de progreso** + barra; tarjetas de metas con emoji, monto/objetivo, barra y %; lateral "Aportes recientes". Botones **Nueva meta** y **+ Aportar**.

### 9. Inversiones

- Banner hero con degradado (valor actual, invertido, rentabilidad, área de evolución) + tabla de instrumentos (ETF/remunerada) con posición, tasa/rentabilidad, valor. Botón **Nueva inversión**.

### 10. Importar (Excel/CSV)

- Stepper (Subir / Mapear / Confirmar) + dropzone + previsualización (archivo detectado, tabla de movimientos, "+N más") + acciones Cancelar / Importar N.

### 11. Perfil — opción "Dos columnas"

- **Layout**: 2 columnas (320px / 1fr). Izquierda: tarjeta con avatar (degradado brand→accent), nombre, correo, pill de plan, "Editar perfil", stats (cuentas / mov. mes / miembro). Derecha: secciones **Preferencias** (Tema oscuro con switch que cambia el tema global, Moneda, Idioma, Formato fecha), **Seguridad** (Contraseña → Cambiar, 2FA switch), **Notificaciones** (3 switches) y fila Cerrar sesión / Eliminar cuenta.

### 12. Login / Registro

- Tarjeta centrada (≤380px) sobre fondo con glow radial teal, logo, campos, botón primary; enlace alterno entre iniciar sesión / registrarse.

## Interacciones y comportamiento

- **Navegación**: sidebar cambia de vista; el bloque de usuario y el avatar abren Perfil; el icono de logout y "Cerrar sesión" van a Login.
- **Tema claro/oscuro**: toggle en sidebar y en Perfil; alterna `data-theme` en el contenedor raíz (todos los tokens conmutan). El estado inicial es oscuro.
- **Modales** (abren desde botones de acción): Nuevo movimiento (toggle Gasto/Ingreso), Nueva cuenta, Nuevo plan, Nueva deuda, Nueva meta, Aportar, Nueva inversión, Registrar pago. Cierran con ✕, Cancelar o clic en backdrop; al guardar → **toast** de confirmación (~2,6s) y cierre. (En el prototipo no persisten datos; en la app conectar a la API.)
- **Toggles/segmentados/filtros/pestañas**: cambian estado activo (Gasto/Ingreso, Te deben/Debes, filtros de Cuentas y Movimientos, pestañas del detalle).
- **Transiciones**: `background .15s` en hover/activos; switch knob `left .15s`. Sin animaciones de entrada.
- **Hover**: filas/tarjetas clicables `cursor:pointer`; ítems de nav con fondo `rgba(102,165,173,.08)`.
- **Responsive**: <860px sidebar→drawer + barra superior; grids 2-col → 1; KPIs 4→2→1; tablas con scroll horizontal.

## Estado (state)

- `screen` (ruta activa) — en la app real lo da react-router.
- `theme` ('dark' | 'light') — persistir en localStorage; aplicar a `<html data-theme>`.
- `modal` (cuál modal abierto | null) + `toast` (mensaje | null con timeout).
- Estados por control: tipo de movimiento, tipo de deuda, filtro de cuentas, filtro de movimientos, pestaña del detalle.
- **Datos**: consumir los contratos de `packages/contracts` (cuentas, movimientos, cuotas, deudas, ahorros, inversiones) vía la capa `api` de cada dominio. Cubrir estados loading/empty/error con `shared/ui/states`.

## Assets

> **`screenshots/`** — capturas de cada pantalla del prototipo (tema oscuro;
> incluye una en tema claro y un modal de ejemplo). Referencia visual directa:
> 01-panel, 02-resumen, 03-cuentas, 04-cuenta-detalle, 05-movimientos,
> 06-cuotas, 07-deudas, 08-ahorros, 09-inversiones, 10-importar, 11-perfil,
> 12-panel-tema-claro, 13-modal-movimiento, 14-login.

- **Iconos**: lucide-react (ya en el repo). No hay íconos propios salvo el glyph "documento" del logo (path `M14 2H6…`).
- **Sin imágenes/emoji** salvo los emoji de metas de ahorro (🗾🛟💻) — opcionales, sustituibles por iconos lucide si se prefiere.
- **Tipografía Geist**: añadir el `@font-face` (woff2) o `@fontsource/geist`.
- Las tarjetas de crédito son SVG/CSS (degradados + círculos), no imágenes.

## Archivos de este bundle

- `prototypes/FinanceApp.dc.html` — app completa (fuente de verdad).
- `prototypes/Cuentas — 3 diseños.dc.html`, `prototypes/Perfil — 3 opciones.dc.html`, `prototypes/Panel — 3 direcciones.dc.html` — exploraciones.
- `prototypes/support.js` — runtime del prototipo (no portar; solo para abrir los `.dc.html`).
- `PROMPT.md` — prompt listo para pegar en Claude Code.
