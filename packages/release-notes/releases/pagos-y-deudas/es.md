---
title: El pago de la tarjeta se ve en su cuenta y deudas sin vencimiento
summary: Pagar una facturación ahora se ve también en la cuenta de la tarjeta, y una deuda ya no necesita fecha de vencimiento.
commits:
  - a9830b96
  - 61b87adc
  - a3051908
  - 689dcf97
  - bbcf7a48
  - 4fb4cd4b
---

## Cambios

- **El pago de una facturación aparece en la cuenta de la tarjeta**: además del gasto en la cuenta
  desde la que pagas, ahora ves el abono en los movimientos de la tarjeta de crédito. Los pagos que
  ya habías hecho también aparecen.
- **Deudas sin fecha de vencimiento**: al crear una deuda el vencimiento parte vacío y dice «Sin
  vencimiento». Al editarla puedes quitarle la fecha.
- Al traspasar una facturación en dólares a pesos, ahora indicas la fecha en que el banco hizo el
  cargo.

## Correcciones

- Una facturación traspasada mostraba US$0,00 y «Deshacer traspaso» prometía devolver 0. Ahora
  muestra su total real.
- Al descargar la plantilla con tus datos, una facturación traspasada a pesos se vuelve a importar
  como traspasada, sin quedar debiendo los dólares otra vez.
- La vista previa de la plantilla ya no falla con un gasto en dólares de una tarjeta adicional sin
  tope propio en dólares. Si la vista previa no carga, lo dice y puedes reintentar.
- La nota de la plantilla con tus datos se lee en una sola línea.
- El sitio de mifik aparece más ordenado en los buscadores.
