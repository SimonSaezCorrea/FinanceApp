# Prompt para Claude Code

Pegar en Claude Code desde la raíz del repo `FinanceApp` (rama `main`), con esta carpeta
de handoff accesible.

---

Trabaja en `apps/web`. Quiero integrar el rediseño de la vista **Ahorros**.

Referencias (en `design_handoff_ahorros/`):

- `README.md` — especificación completa: layout, medidas, tokens, copy, estados y fórmulas.
- `FinanceApp.dc.html` — prototipo HTML interactivo del app. Ábrelo y ve a "Ahorros".

El HTML es **solo referencia de diseño**, no lo copies. Recrea la vista en el stack actual
del repo (React + TypeScript + Tailwind) reutilizando lo que ya existe:
`src/shared/ui/*` para botones, cards, badges, switch, side-panel y empty-state; tokens de
`src/styles/index.css` (usa las variables, no hex); iconos Lucide.

Alcance:

1. `src/domains/savings/routes/SavingsRoute.tsx` — encabezado con doble acción, tarjeta de total
   con desglose por meta, grupos de metas (En curso → Fuera de plazo → Cumplidas), bloque de
   metas cerradas colapsable y bloque de ahorro libre.
2. Componentes en `src/domains/savings/components/`: tarjeta de total + barra apilada,
   cabecera de grupo, fila de meta (chip, barra de progreso, línea de estado, montos, acciones)
   y fila de meta cerrada.
3. Panel de detalle sobre `src/shared/ui/overlay/{side-panel,chrome}.tsx`: progreso, tres stats,
   filas de detalle e historial de aportes.
4. Panel nuevo/editar meta sobre `form-surface.tsx`: título, monto objetivo, switch de fecha
   límite (y la fila de fecha condicional), moneda y nota.
5. Panel de registrar aporte (chips de destino, fecha, cuenta de origen, nota) y panel de
   cerrar meta (monto acumulado, tres destinos seleccionables, meta de destino condicional,
   fecha de cierre).

Reglas:

- Respeta las medidas y el copy en español del README **literalmente** (subtítulos con cifras,
  separador " · ", comillas angulares «», montos con `tabular-nums`).
- Implementa la lógica de estado de meta y la proyección con las fórmulas del README
  (cumplida / vencida / no llega a tiempo / en ritmo / sin aportes), incluido el aporte
  necesario redondeado a 10.000.
- Cerrar meta solo si está cumplida o vencida, y siempre a través del panel de cierre.
  Las metas cerradas quedan fuera del total, del ritmo y de "falta por reunir".
- Ambos temas (oscuro por defecto y claro) deben verse correctos.
- Tipa `Goal`, `Entry` y el estado de overlays como en el README; nada de `any`.
- Mantén la lógica de datos existente del dominio `savings`; esto es un cambio de UI.
- Sin librerías nuevas.

Antes de escribir código: lee `SavingsRoute.tsx`, los componentes del dominio `savings`,
los primitivos de `shared/ui` y una ruta ya alineada al diseño (por ejemplo
`src/domains/recurring/routes/RecurringRoute.tsx` si ya se integró) y dime en un párrafo qué
componentes vas a reutilizar y qué vas a crear. Luego implementa.

Al terminar: corre lint y typecheck, y lista qué quedó pendiente o ambiguo.
