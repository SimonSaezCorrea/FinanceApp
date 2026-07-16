# Prompt para Claude Code

Copia y pega esto en Claude Code, abierto en la raíz del repo `FinanceApp`.

---

Estoy rediseñando la app web de **FinanceApp** (`apps/web`). En
`design_handoff_financeapp/` tienes un paquete de handoff: un **README.md** con
specs detalladas por pantalla + tokens de diseño, y en `prototypes/` los
prototipos HTML de referencia (alta fidelidad). **Léelos primero**: empieza por
`design_handoff_financeapp/README.md` y abre `prototypes/FinanceApp.dc.html`
(es la fuente de verdad — app completa navegable).

Los HTML son **solo referencia visual y de comportamiento**, con estilos en
línea. No los copies: **recréalos en el stack real** (React + TypeScript + Vite

- Tailwind) usando los patrones que ya existen en el repo.

## Antes de escribir código, explora y respeta lo que ya hay

- Tokens: `apps/web/src/styles/index.css` (canales HSL) y `apps/web/tailwind.config.ts`.
- Primitivos UI: `apps/web/src/shared/ui/` (`Card`, `Button`, `Badge`, `Table`, `PageHeader`, `states`…). Úsalos; no reinventes con estilos en línea.
- Rutas por dominio: `apps/web/src/domains/<dominio>/routes`; layout en `apps/web/src/app/AppLayout.tsx`.
- Datos: contratos en `packages/contracts/src/`. Usa esas formas; cubre loading/empty/error con `shared/ui/states`.
- i18n: textos en `apps/web/src/i18n/es.json` (todo en español, registro tú). Completa al español los strings que sigan en inglés.

## Qué implementar (en este orden)

1. **Tokens + tipografía**: añade el acento arcilla (`--accent`: `#E76F51` claro / `#F4A261` oscuro) como canales HSL y cámbialo en Tailwind; cambia la fuente a **Geist**. (Tabla exacta de tokens en el README → "Design tokens".)
2. **Tema claro/oscuro**: alterna `data-theme` en `<html>`, persiste en localStorage, oscuro por defecto.
3. **Pantallas** (specs en el README → "Pantallas / Vistas"): Panel (wallet), Resumen, Cuentas (grid de tarjetas) + Detalle (denso con pestañas), Movimientos, Cuotas, Deudas, Ahorros, Inversiones, Importar, Perfil (dos columnas), Login/Registro.
4. **Modales y toasts** de las acciones (+ Movimiento, Nueva cuenta, etc.) conectados a la capa `api` de cada dominio.
5. **Gráficos**: donut de gasto, sparklines y evolución de saldo — con SVG propio o Recharts (elige y justifica).
6. **Responsive**: sidebar→drawer <860px, grids que colapsan (detalle en el README).

## Forma de trabajo

- Hazlo **una pantalla a la vez**; empieza por **Cuentas (general + detalle)**, que es la prioritaria. Enséñame el resultado antes de seguir.
- Respeta convenciones, lint y estructura de carpetas existentes. No introduzcas librerías nuevas sin proponerlo.
- Si algo del diseño choca con un patrón del codebase, pregúntame en vez de asumir.

Confírmame tu plan (qué archivos tocarás para Cuentas) antes de empezar.
