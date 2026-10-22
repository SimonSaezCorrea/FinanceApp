# Research: Simulador público de compra en cuotas

## R1. CAE (carga anual equivalente): fórmula regulatoria

- **Decision**: CAE = i × 12, donde i es la tasa MENSUAL que iguala lo recibido con todos los pagos:
  `D = Σ_{m=1..N} R_m (1+i)^(-m)`. D = precio (el dinero que la persona "recibe" como bien); R_m =
  cada cuota (amortización + interés + costos financiados). Se muestra como porcentaje con 2 decimales.
- **Rationale**: DS 43/2012 (Reglamento sobre información al consumidor de créditos de consumo),
  definición de CAE: "Ecuación 1: CAE = i_f * f" y "Ecuación 2: Σ D_n (1+i_f)^(-t_n) = Σ R_m
  (1+i_f)^(-t_m)", con R_m = pagos por amortización, intereses, gastos o cargos del crédito y
  productos voluntarios; f = frecuencia de composición (12 en cuotas mensuales). Es decir, la tasa
  periódica se **multiplica** por la frecuencia, no se compone. Fuente:
  [LeyChile, Decreto 43](https://www.bcn.cl/leychile/navegar?idNorma=1041744) (texto extraído de la
  ecuación embebida del XML oficial, 2026-10-22). La SUSESO usa la misma forma para créditos
  universales ([compendio](https://www.suseso.gob.cl/620/w3-propertyvalue-593703.html)).
- **Precio contado distinto**: la CAE usa siempre D = precio en cuotas (lo que el contrato financia).
  El descuento por pagar contado se muestra en la comparación contado vs cuotas (FR-011), no se mezcla
  en la CAE, para que la cifra sea la misma que informaría la institución.
- **Solución numérica**: bisección sobre i ∈ [0, 1] (mensual) con `decimal.js` (Principio I: nada de
  `number` para tasas ni montos) hasta |f(i)| < 1e-10 o 200 iteraciones; el valor presente se acumula
  multiplicando el factor de descuento por cuota (sin `pow` por fila). Con todos los pagos iguales al
  precio y sin interés, la CAE es exactamente 0. ≤ 60 cuotas × ≤ 200 iteraciones ≈ 12.000
  multiplicaciones Decimal: unos pocos ms en un teléfono.
- **Alternatives**: `(1+i)^12 − 1` (tasa efectiva anual): rechazada, no es la definición regulatoria y
  daría una cifra distinta de la del banco. Newton-Raphson: más rápido, pero puede divergir con costos
  muy altos; la bisección siempre converge en el intervalo y basta.

## R2. Impuesto de timbres y estampillas

- **Decision**: tasa legal = `min(0,066% × meses, 0,8%)`, con meses = número de cuotas (la última cuota
  vence a N meses de la compra). Se aplica sobre el precio; el monto se redondea a la unidad de la
  moneda. Prellenado en el campo como porcentaje; la persona puede escribir otro o dejarlo vacío (= 0).
  Mientras no lo edite, sigue al número de cuotas. Si el valor usado difiere del legal, aviso + botón
  "Usar la tasa legal".
- **Rationale**: DL 3.475, art. 1 N°3, tasas vigentes desde el 01.01.2016 (Ley 20.780): 0,066% por cada
  mes o fracción entre emisión y vencimiento, máximo 0,8%; a la vista o sin plazo 0,332% (no aplica: el
  simulador siempre tiene plazo). Fuentes: [SII, texto de la ley](https://www.sii.cl/normativa_legislacion/leyimpuestoyestampillas.pdf),
  [SII, circular 17/2015](https://www.sii.cl/documentos/circulares/2015/circu17.pdf),
  [SII, preguntas frecuentes](https://www.sii.cl/preguntas_frecuentes/otros_impuestos/001_390_0356.htm).
  12 meses = 0,792%; 13 o más = 0,8%.
- **Base imponible**: el precio, no el monto financiado con el propio impuesto (evita circularidad;
  la diferencia es < 0,01% del precio). Documentado en la página ("calculado sobre el precio").
- **Alternatives**: base = monto financiado: circular, distinto de cómo la persona lee la cotización.

## R3. Cómo se financian los costos (clarify Q2)

- **Decision**: `monto financiado = precio + impuesto + comisión`. Ese monto amortiza y genera interés.
  La columna "costos" de la tabla es la parte de capital de cada cuota que corresponde a costos:
  `capital_k × (costos / financiado)` redondeada a la moneda; la última fila absorbe la diferencia para
  que la suma de la columna sea exactamente los costos. El interés NO se reparte entre capital y
  costos (es interés del monto financiado completo).
- **Rationale**: es como cotiza la banca ("monto bruto del crédito") y lo eligió la persona (A).

## R4. Sistemas de cálculo y redondeo

- **Cuota fija (francés, por defecto)**: con i > 0, `c = P·i / (1 − (1+i)^(−n))` redondeada a la escala
  de la moneda; cada mes `interés = round(saldo × i)`, `capital = c − interés`; la última cuota =
  `saldo + interés` (absorbe el redondeo, puede diferir de c en unidades). Con i = 0, el reparto en
  partes iguales con la última absorbiendo (mismo resultado que capital constante sin interés).
- **Capital constante**: se llama a la MISMA `equalPrincipalSchedule({ totalPrincipal, installmentCount,
aprPerPeriod: i, currency })` que usa la app (Principio I: una sola implementación para ese reparto).
  Su parámetro `aprPerPeriod` es la tasa por período (mensual), tal como la usa la app.
- **Nueva función**: `fixedPaymentSchedule` en `@finance/money` (mismo `ScheduleRow` de salida). Es la
  ÚNICA implementación del sistema francés; ninguna parte de la app la usa hoy. Se enmienda el
  Principio I para nombrarla junto a `equalPrincipalSchedule` (MINOR).
- **Redondeo**: `currencyScale` (CLP 0, USD 2, CLF 4), `ROUND_HALF_EVEN` como `equalPrincipalSchedule`.

## R5. Límites de entrada

- **Decision**: cuotas enteras 1–60; tasa mensual 0–10% con hasta 4 decimales; precio > 0 y ≤ 10^12
  (escala de la moneda); comisión ≥ 0; impuesto 0–5%; precio contado opcional, > 0 y ≤ precio.
  Fuera de rango: mensaje por campo, sin resultados.
- **Rationale**: 60 cubre créditos de consumo y retail (48). La tasa máxima convencional de oct. 2026
  para operaciones ≤ 50 UF y ≥ 90 días es 41,02% anual ≈ 3,42% mensual
  ([Diario Oficial, 15-10-2026](https://www.diariooficial.interior.gob.cl/publicaciones/2026/10/15/44574/01/2885690.pdf));
  10% mensual deja margen para tasas de mora o casos raros sin aceptar errores de tipeo groseros
  (p. ej. 25 en vez de 2,5). No se fija la TMC en la página porque cambia cada mes.

## R6. Dónde vive el cálculo y cuánto pesa

- **Decision**: módulo puro nuevo `packages/money/src/installmentSimulation.ts`, subpath
  `@finance/money/installment-simulation` (con `decimal.js`): `stampTaxRate`, `fixedPaymentSchedule`,
  `simulateInstallments(input) → SimulationResult` (cronograma + totales + CAE + comparación). La página
  lo usa dos veces: en el build (Astro) para escribir en el HTML el ejemplo por defecto ya resuelto, y
  en el navegador, importado dinámicamente **en el idle de la página** (`requestIdleCallback`, con
  fallback a `setTimeout`) y, si la persona escribe antes, en su primera tecla.
- **Rationale**: Lighthouse móvil 100 (SC-003): el HTML llega con el resultado del ejemplo (sin layout
  shift ni espera), el JS inicial de la página es solo el manejo de campos (~3 KB), y `decimal.js`
  (~12 KB gzip) baja después de pintar. Igual patrón que el conversor de spec 033.
- **Alternatives**: React island: rechazado por la regla del sitio (sin React al llegar). Cálculo en
  `number`: prohibido por el Principio I.

## R7. Formato de números al escribir

- **Decision**: mover `apps/landing/src/domains/rates/lib/typing.ts` (agrupar miles mientras se escribe,
  conservando el cursor) a `apps/landing/src/lib/typing.ts` y usarlo en ambas páginas; leer los campos
  con el mismo parser por idioma del conversor (`converter.ts`'s parse). Montos mostrados con
  `Intl.NumberFormat` del idioma (`es-CL`/`en-US`) sobre la cadena decimal ya redondeada.
- **Rationale**: dos dominios lo usan; el comportamiento ya está probado (spec 033).

## R8. Rutas, enlaces y metadatos

- **Decision**: página `installmentSimulator`, slugs `/es/simulador-cuotas/` y
  `/en/installment-calculator/` (la excepción de slugs por idioma de spec 033 se generaliza: `RATE_SLUGS`
  pasa a `LOCALIZED_SLUGS`, que incluye las páginas de indicadores y esta). Ruta Astro propia
  `src/pages/[lang]/[simulator].astro`. Sitemap: el par se agrega a la tabla de alternativas de
  `astro.config.mjs`. Enlaces: pie de página (junto a los indicadores) y un bloque en el home después
  de los indicadores. JSON-LD: `WebApplication` (applicationCategory "FinanceApplication", gratis) +
  `BreadcrumbList`. Título/descripción en `landing.meta.installmentSimulator.*`.
- **CTA**: bloque de invitación con `<a href="?acceso=registro" data-access="registro">` dentro de un
  `[data-access-slot]` con su `<template data-app-template>` "Ir a la app" (mismo mecanismo del
  encabezado, `scripts/session.ts`), para cumplir FR-018 con sesión.

## R9. Accesibilidad

- Campos con `<label>`, errores con `aria-describedby` + `aria-invalid`; resumen de resultados en una
  región `aria-live="polite"` que anuncia solo la cuota y el total (no la tabla); sistema de cálculo
  como grupo de radios nativo; tabla con `<caption>` y encabezados `scope`. Objetivos táctiles 44 px.

## R10. Sin datos guardados

- Nada se guarda ni se envía (FR-020): ni la URL lleva parámetros de la simulación (decisión: no hace
  falta compartirla en esta versión y evita páginas duplicadas para buscadores), ni `localStorage`.
