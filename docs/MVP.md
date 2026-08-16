# Alcance del MVP

Definido el **2026-08-15**. Este documento manda sobre qué entra en la primera iteración; cuando algo
se recorta aquí, la razón se escribe aquí y el detalle técnico de lo recortado queda en
`docs/CATALOGO_REGIONAL.md` o en `docs/PENDING.md`.

## Las tres decisiones

### 1. Solo Chile

El catálogo de instituciones, monedas y tipos de identificación se reduce a Chile.

- **Se sacó del seed**: los 6 países pasaron a 1 (CL); las 12 instituciones argentinas (9 bancos +
  3 PSP) y sus productos; los enlaces país↔moneda y país↔identificación de AR/CO/PY/PE/PR.
- **NO se tocó el modelo**: `Country` sigue siendo una tabla con FK, el filtro `GET
/institutions?country=` sigue existiendo, `InstitutionKind.PAYMENT_PROVIDER` sigue definido, y
  `accountNumberFormat`/`isValidCbu`/`usesAccountAlias` siguen en `@finance/contracts` con sus
  tests. La app es multi-país; **su catálogo es de un país**.
- **Por qué**: Colombia, Perú, Paraguay y Puerto Rico estaban sembrados con cero instituciones, así
  que el selector de país ofrecía mercados vacíos. Mantener Argentina a medias costaba verificación
  de datos que no le sirve a nadie todavía.
- **Para volver a expandir**: `docs/CATALOGO_REGIONAL.md` conserva el catálogo argentino completo con
  sus códigos BCRA, las reglas de CBU/CVU/alias y los tipos de identificación por país.

### 2. Tres monedas: CLP, USD y UF

- `CLP` (peso), `USD` (dólar) y **`CLF`, que es el código ISO 4217 de la Unidad de Fomento**.
- **La UF no se convierte a pesos.** Es una unidad de cuenta reajustable y esta app no tiene
  proveedor de tipo de cambio: un monto en UF se guarda y se muestra en UF. Sumar UF con CLP sería
  inventar una cifra.
- Los totales **nunca mezclan monedas**: se agrupan por moneda, como ya hace el resumen de
  movimientos (`currencyTotals`).
- Los "≈ $X CLP" que acompañan montos en dólares salen de una tabla de tasas **estáticas escritas a
  mano** (`apps/web/src/shared/lib/fx.ts`) y solo se usan como pista visual, nunca para validar,
  comparar contra un límite ni persistir. **La UF no está en esa tabla**: no hay un valor confiable
  que escribir, así que un monto en UF simplemente no muestra equivalencia.
- **Se sacó del seed**: las 168 monedas ISO. La lista completa está en el commit `2df6f71`.

### 3. Inversiones al final

La vista de inversiones es lo último de la primera iteración. La spec ya está escrita y aprobada en
lo esencial (`specs/012-investment-tracking/spec.md`, estado _Deferred_), con dos decisiones abiertas
que se resuelven al retomarla:

1. Si una cuenta de inversión alberga **un** instrumento o **varios** (en Fintual el usuario ve una
   cuenta con varios fondos adentro).
2. Si esa cuenta la crea la app al registrar el instrumento, o la elige el usuario.

Mientras tanto `/investments` sigue siendo la lista de solo lectura que ya existía, y **nada
invertido entra al patrimonio neto** (ver `docs/PENDING.md` § Inversiones).

## Lo que el MVP sí incluye

Todo lo que ya está construido y funcionando: cuentas (corriente, vista, ahorro, tarjeta de crédito,
prepago, efectivo) con sus tarjetas y cupos, movimientos con traspasos y comprobantes, facturación
de tarjetas de crédito con pagos y carry-over, deudas, cuotas, ahorros, gastos recurrentes, panel y
perfil.

## Consecuencias operativas

- El seed borra explícitamente lo que ya no pertenece al catálogo (países, monedas e instituciones
  fuera de la lista), no solo deja de crearlo: un `db:seed` sobre una base vieja tiene que converger
  al catálogo del MVP.
- Los datos demo quedan todos en CLP/USD/UF. La cuenta argentina de ejemplo y el ETF en EUR se
  retiraron.
