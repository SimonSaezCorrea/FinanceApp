# Money & State Mutation Requirements Quality Checklist: Vista Cuotas

**Purpose**: Validar que los requisitos que mueven dinero —crear un gasto, mover un saldo, arrastrar
un faltante, revertirlo— están completos y sin contradicciones ANTES de implementarlos. Es la mitad
de la feature que puede descuadrar los libros del usuario, así que se audita aparte de la UX.
**Created**: 2026-08-15
**Feature**: [spec.md](../spec.md) | [data-model.md](../data-model.md)

## Requirement Completeness — el arrastre

- [x] CHK001 - ¿Está definido qué ocurre cuando el **excedente** de un pago es MAYOR que la siguiente cuota impaga? FR-021 dice que se resta de ella, pero no dice si puede dejarla en negativo, si se propaga a la subsiguiente, o si se rechaza. [Gap, Spec §FR-021]
- [x] CHK002 - ¿Está definido qué ocurre al pagar de MÁS la **última** cuota impaga? FR-023 sólo cubre el faltante en la última, no el excedente. [Gap, Spec §FR-023]
- [x] CHK003 - ¿Está definido cómo interactúa el arrastre con la **última cuota ajustada por redondeo** (la que absorbe el resto de la división)? Son dos ajustes sobre la misma cuota y el orden importa. [Gap, Spec §FR-021 vs §FR-041]
- [x] CHK004 - ¿Está enunciada como requisito la invariante de que el arrastre **ni pierde ni inventa dinero** (lo pagado + lo adeudado siempre iguala lo programado)? Hoy sólo vive en el modelo de datos (INV-C4), no en la spec. [Traceability, Gap]
- [x] CHK005 - ¿Está definido a cuál cuota se aplica el arrastre cuando hay cuotas pagadas **intercaladas** (deshacer permite pagar fuera de orden)? [Coverage, Spec §FR-021, Edge Case «cuota pagada fuera de orden»]

## Requirement Completeness — el gasto y su reversión

- [x] CHK006 - ¿Está definido qué pasa con los **gastos ya creados** al ELIMINAR el plan: se borran, se conservan huérfanos, o se pregunta? Un plan con seis cuotas pagadas son seis movimientos reales cuyo destino la spec no declara. [Gap, Spec §FR-050]
- [x] CHK007 - ¿Está definido qué pasa con el **cargo financiero por interés** al eliminar el plan? El caso borde lo nombra, pero no hay requisito que lo resuelva. [Gap, Spec §Edge Cases]
- [x] CHK008 - ¿Está definido qué ocurre si el gasto de una cuota se **EDITA** (no se borra) desde Movimientos, cambiándole el monto? FR-028 sólo cubre la desaparición, y un monto editado deja `paidAmount` mintiendo. [Gap, Spec §FR-028]
- [x] CHK009 - ¿Está definido si una cuenta de tipo **crédito** puede ser cuenta de pago de una cuota? Pagar una cuota con una tarjeta de crédito es refinanciar deuda con deuda; el modelo de traspasos ya prohíbe el caso análogo (`TRANSFER_TO_CREDIT_ACCOUNT`) y aquí no hay regla escrita. [Gap, Conflict, Spec §FR-018]
- [x] CHK010 - ¿Está definido si deshacer un pago cuya cuenta de origen fue **desactivada** después es posible, y qué pasa con su saldo? [Coverage, Gap]
  - **Resuelto (2026-08-22):** sí se permite, y el saldo se restituye igual. Una cuenta inactiva no
    acepta movimientos NUEVOS, pero deshacer no crea historia: la corrige. Bloquearlo dejaría la cuota
    pagada para siempre y el gasto sin forma de borrarse. `UnpayInstallmentHandler` restituye el saldo
    de la cuenta que REALMENTE pagó (`accountIdForTransaction`), sin mirar su estado.
- [x] CHK011 - ¿Está definido el comportamiento al deshacer una cuota cuyo plan **cambió de tarjeta** a una CREDIT después del pago? El caso borde lo nombra sin resolverlo. [Gap, Spec §Edge Cases]

## Requirement Clarity

- [x] CHK012 - ¿Está claro que «pagada» se determina por la fecha real de pago y no por la existencia de monto pagado, dado que una cuota antigua está pagada sin monto? [Clarity, Ambiguity, Research §R10]
- [x] CHK013 - ¿Está cuantificado qué significa que el pago se «rechaza» en FR-026 — qué condiciones exactas de la cuenta lo impiden y cuáles no? [Clarity, Spec §FR-026]
- [x] CHK014 - ¿Está definido cómo se determina el monto **prellenado** cuando la cuota arrastra un faltante: el programado o el adeudado? [Ambiguity, Spec §FR-016 vs §FR-022]
- [x] CHK015 - ¿Está definido qué monto alimenta el indicador «pendiente total» cuando hay arrastres: el programado o el adeudado? [Ambiguity, Spec §FR-004 vs §FR-022]

## Requirement Consistency

- [x] CHK016 - ¿Es consistente FR-020 («no reescribir el calendario») con FR-021 («el arrastre se suma a la siguiente cuota»)? Debe quedar explícito que el arrastre es una cifra aparte y no una modificación del monto programado. [Consistency, Spec §FR-020 vs §FR-021]
- [x] CHK017 - ¿Es consistente el bloqueo de movimiento en tarjeta CREDIT (FR-035) con la existencia del cargo financiero automático (FR-045), que sí crea un movimiento en esa misma cuenta? Son dos movimientos con reglas opuestas sobre la misma cuenta y conviene que la diferencia esté escrita. [Consistency, Spec §FR-035 vs §FR-045]
- [x] CHK018 - ¿Concuerda «lo abonado a la cuota se calcula con el monto en la moneda del plan» (FR-031) con que el gasto se registre en la moneda de la cuenta (FR-030), sin dejar hueco sobre cuál de los dos valida los límites de la cuenta? [Consistency, Spec §FR-030 vs §FR-031]

## Non-Functional & Data Integrity

- [x] CHK019 - ¿Está enunciado como requisito que el pago sea **atómico** (cuota, gasto, saldo y arrastre se aplican todos o ninguno)? El plan lo asume; la spec no lo pide. [Gap, Traceability]
- [x] CHK020 - ¿Está definida la **precisión monetaria** exigida al arrastre (mismo redondeo que el resto del dominio, sin acumulación de error a lo largo de N cuotas)? [Gap, Constitution §I]
- [x] CHK021 - ¿Están definidos los requisitos para las cuotas **preexistentes** sin monto ni gasto asociado, en cada cifra que las incluye (pagado, restante, indicadores)? [Coverage, Spec §Assumptions]
- [x] CHK022 - ¿Tiene cada código de error nuevo su condición de disparo enunciada de forma que se pueda escribir un test antes que el código? [Measurability, Contract §Códigos de error]

## Notes

- **Resultado de la revisión: 21/22 resueltos.** Queda abierto CHK010 (deshacer un pago cuya cuenta
  de origen fue desactivada después): es de bajo impacto — el saldo se restituye igual, una cuenta
  inactiva no es una cuenta borrada — y se deja como decisión de implementación.
- Cuatro se resolvieron preguntando al usuario (CHK006, CHK008, CHK009 y, por arrastre, CHK007/CHK011);
  el resto se cerraron con precisiones añadidas a la spec (FR-021a..d, FR-026a, FR-019a, FR-050a/b).
- CHK001, CHK002, CHK006 y CHK009 eran huecos **materiales**: los cuatro pueden producir un descuadre
  de saldo o una pérdida de datos silenciosa, y ninguno tiene hoy respuesta en la spec.
- CHK009 es además el más probable de olvidar en implementación, porque el caso análogo ya está
  resuelto en otro dominio y es fácil suponer que la regla se hereda. No se hereda.
- CHK004 y CHK019 son de trazabilidad: la regla existe en el plan o en el modelo de datos, pero no
  como requisito verificable en la spec, que es donde `/speckit-analyze` la va a buscar.
