---
title: Cambiar la tarjeta principal y cupos por moneda
summary: Cuando el banco te cambia el plástico, eliges la nueva principal en un paso.
commits:
  - 36d2623e
  - fb63c8df
---

## Nuevo

- **Cambiar la tarjeta principal**: al desactivar o eliminar la principal de una tarjeta de
  crédito, eliges en el mismo paso cuál queda como principal: otra tarjeta de la cuenta o la nueva
  que te envió el banco. El cupo de la cuenta no cambia.
- **Marcar como principal**: desde el detalle de una tarjeta adicional puedes hacerla la principal
  cuando quieras.
- Si una cuenta quedó sin tarjeta principal activa, verás un aviso para elegir una.

## Cambios

- **El cupo en dólares es de la cuenta**: todas las tarjetas gastan del mismo cupo en cada moneda.
  La principal usa el 100% y una adicional puede tener un tope propio, siempre dentro del cupo de la
  cuenta. El cupo en otras monedas se edita desde la cuenta.
- Un gasto en una moneda en que la cuenta no tiene cupo ya no se acepta, y un gasto en dólares nunca
  descuenta del cupo en pesos.

## Correcciones

- Las tarjetas desactivadas ya no aparecen al registrar un movimiento, una plantilla, una compra en
  cuotas o un gasto fijo. Lo ya registrado con ellas se conserva.
