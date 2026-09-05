# Prompt para Claude Code

Pegar en Claude Code desde la raíz del repo `FinanceApp` (rama `main`), con esta carpeta
de handoff accesible.

---

Trabaja en `apps/web`. Quiero integrar el rediseño de la vista **Deudas**.

Referencias (en `design_handoff_deudas/`):
- `README.md` — especificación completa: layout, medidas, tokens, copy, estados y fórmulas.
- `FinanceApp.dc.html` — prototipo HTML interactivo del app. Ábrelo y ve a "Deudas".

El HTML es **solo referencia de diseño**, no lo copies. Recrea la vista en el stack actual
del repo (React + TypeScript + Tailwind) reutilizando lo que ya existe:
`src/shared/ui/*` para botones, cards, tablas, badges, segmented, side-panel, empty-state;
tokens de `src/styles/index.css` (usa las variables, no hex); iconos Lucide.

Alcance:
1. `src/domains/debts/routes/DebtsRoute.tsx` — encabezado, filtros, tabla desktop,
   lista móvil (<1280px) y estado vacío.
2. `src/domains/debts/components/DebtKpiStrip.tsx` — tarjeta de resumen: Debes / Balance neto /
   Te deben, barra apilada rojo-verde y pie con nota de share + chip de vencidos.
3. `src/domains/debts/components/DebtTable.tsx` — columnas Persona · Avance · Tipo · Pendiente ·
   Vence · acciones, con avatar de iniciales, barra de avance y badge de tipo.
4. Paneles laterales sobre `src/shared/ui/overlay/{side-panel,chrome,form-surface}.tsx`:
   detalle de la deuda (con calendario de abonos), registrar abono y nueva/editar deuda.
5. Un nuevo componente de fila móvil si no existe uno reutilizable en `shared/ui`.

Reglas:
- Respeta las medidas y el copy en español del README **literalmente** (subtítulos con cifras,
  separador " · ", signo "−" U+2212, montos con `tabular-nums`).
- Ambos temas (oscuro por defecto y claro) deben verse correctos.
- Deriva los totales con las fórmulas del README; no dupliques lógica que ya exista en el dominio.
- Tipa el modelo `Debt` y el estado del panel como en el README; nada de `any`.
- Mantén la lógica de datos existente del dominio `debts`; esto es un cambio de UI.
- Sin librerías nuevas.

Antes de escribir código: lee `DebtsRoute.tsx`, `DebtKpiStrip.tsx`, `DebtTable.tsx`,
los primitivos de `shared/ui` y una ruta ya alineada al diseño (por ejemplo
`src/domains/installments/routes/InstallmentsRoute.tsx`) y dime en un párrafo qué
componentes vas a reutilizar y qué vas a crear. Luego implementa.

Al terminar: corre lint y typecheck, y lista qué quedó pendiente o ambiguo.
