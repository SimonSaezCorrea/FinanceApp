# Prompt para Claude Code

Pegar en Claude Code desde la raíz del repo `FinanceApp` (rama `main`), con esta carpeta
de handoff accesible.

---

Trabaja en `apps/web`. Quiero integrar el rediseño de la vista **Recurrentes**.

Referencias (en `design_handoff_recurrentes/`):
- `README.md` — especificación completa: layout, medidas, tokens, copy, estados y fórmulas.
- `FinanceApp.dc.html` — prototipo HTML interactivo del app. Ábrelo y ve a "Recurrentes".

El HTML es **solo referencia de diseño**, no lo copies. Recrea la vista en el stack actual
del repo (React + TypeScript + Tailwind) reutilizando lo que ya existe:
`src/shared/ui/*` para botones, cards, badges, side-panel, modal y empty-state; tokens de
`src/styles/index.css` (usa las variables, no hex); iconos Lucide.

Alcance:
1. `src/domains/recurring/routes/RecurringRoute.tsx` — encabezado, tarjeta de total con
   desglose por categoría, franja de generación automática y grupos por periodicidad
   (Diarios → Semanales → Mensuales → Anuales → Pausados).
2. Componentes en `src/domains/recurring/components/`: tarjeta de total + barra apilada,
   cabecera de grupo, y fila de recurrente (chip de icono, meta según estado, monto,
   acciones pausar/editar/eliminar ocultas en móvil).
3. Panel de detalle sobre `src/shared/ui/overlay/{side-panel,chrome}.tsx`: badge de estado,
   tres stats, filas de detalle e historial de hasta 4 ocurrencias generadas.
4. Panel nuevo/editar sobre `form-surface.tsx`: nombre, monto, categoría, periodicidad cíclica,
   stepper de intervalo, primera ocurrencia, cuenta, toggle activo/pausado y nota explicativa.
5. Modal de pausa/reactivación con selector de fecha — pausar y reactivar **siempre** pasan por
   este modal, nunca son inmediatos.

Reglas:
- Respeta las medidas y el copy en español del README **literalmente** (subtítulos con cifras,
  separador " · ", comillas angulares «» en el modal, montos con `tabular-nums`).
- Normaliza a mensual con los factores del README (`DAILY 30.417`, `WEEKLY 4.333`,
  `MONTHLY 1`, `YEARLY 1/12`); los pausados no cuentan en totales ni desglose.
- Ambos temas (oscuro por defecto y claro) deben verse correctos.
- Tipa `Recurring`, `Freq` y el estado de overlays como en el README; nada de `any`.
- Mantén la lógica de datos existente del dominio `recurring`; esto es un cambio de UI.
- Sin librerías nuevas.

Antes de escribir código: lee `RecurringRoute.tsx`, los componentes del dominio `recurring`,
los primitivos de `shared/ui` y una ruta ya alineada al diseño (por ejemplo
`src/domains/debts/routes/DebtsRoute.tsx` si ya se integró) y dime en un párrafo qué
componentes vas a reutilizar y qué vas a crear. Luego implementa.

Al terminar: corre lint y typecheck, y lista qué quedó pendiente o ambiguo.
