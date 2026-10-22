# Quickstart: validar el simulador de cuotas

## Prerrequisitos

`pnpm install`. No hace falta la API ni la base de datos.

## Pruebas automáticas

```bash
pnpm --filter @finance/money test          # stampTaxRate, fixedPaymentSchedule, CAE, simulateInstallments (≥ 10 casos de referencia, SC-001)
pnpm --filter @finance/landing test        # validación de campos, script de la página (jsdom), typing movido
EXCHANGE_RATES_SNAPSHOT=test/fixtures/rates-snapshot.json pnpm --filter @finance/landing build
pnpm --filter @finance/landing test:build  # metadatos, hreflang, sitemap, ejemplo resuelto en el HTML, sin React
pnpm --filter @finance/landing typecheck
```

## Casos de referencia (calculados a mano, deben coincidir al peso / centavo)

1. CLP 300.000, 6 cuotas, 2%, **sin costos** (impuesto vaciado), cuota fija → cuota $53.558, CAE 24,00%.
2. Mismo con impuesto legal (0,396% → $1.188) → financiado $301.188; CAE > 24%.
3. CLP 64.990, 3 cuotas, 0%, sin costos → 21.663 + 21.663 + 21.664; "pagas lo mismo que al contado";
   CAE 0,00%.
4. Caso 3 con impuesto legal → "no es del todo sin interés"; extra = impuesto.
5. Caso 1 en capital constante → primera > última; diferencia de total vs cuota fija negativa.
6. 1 cuota, 2% → pago = financiado × 1,02; CAE 24,00% (sin costos).
7. UF 100, 24 cuotas, 0,5% → montos con 4 decimales.
8. USD 1.200, 12 cuotas, 1,5% → montos con 2 decimales.
9. Precio contado 280.000 con caso 1 → extra contra 280.000.
10. Valores inválidos: 0 cuotas, 61 cuotas, tasa 12%, precio vacío → mensajes por campo, sin resultados.

## A mano en el navegador (`pnpm --filter @finance/landing dev`)

1. Abrir `/es/simulador-cuotas/` sin sesión: el ejemplo (con impuesto legal, cuota $53.770) ya está resuelto antes de escribir.
2. Cambiar valores: el resultado cambia en cada tecla; desconectar la red y seguir.
3. Editar el impuesto: aparece el aviso y "Usar la tasa legal"; cambiar cuotas no pisa el valor escrito.
4. Cambiar a inglés: misma herramienta en `/en/installment-calculator/`.
5. Desde el home y el pie de página llegar a la página.
6. Con sesión: el bloque final dice "Ir a la app".
7. Lighthouse móvil (perfil limpio): rendimiento ≥ 95, el resto 100, LCP ≤ 2 s (SC-003).
