# UX Requirements Quality Checklist: Vista Cuotas

**Purpose**: Validar que los requisitos de interfaz de la vista Cuotas están completos, medibles y
sin contradicciones, ANTES de implementarlos. No prueba la implementación: prueba el texto.
**Created**: 2026-08-15
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [x] CHK001 - ¿Están definidos los estados de **carga** y de **error** de la lista, además del vacío? [Gap, Spec §FR-058 sólo cubre el vacío]
- [x] CHK002 - ¿Está especificado el **orden** en que se listan los planes (por próxima cuota, por fecha de creación, alfabético)? [Gap, Spec §FR-001]
- [x] CHK003 - ¿Está definido qué ocurre con el panel de detalle **después de pagar** una cuota: permanece abierto mostrando el nuevo estado, o se cierra? [Gap, Spec §FR-014]
- [x] CHK004 - ¿Están especificados los requisitos de **accesibilidad** del panel lateral (foco atrapado, cierre con Escape, foco devuelto a la fila de origen, rol y etiqueta)? [Gap]
- [x] CHK005 - ¿Está definida la **navegación ‹ › entre planes** dentro del panel, o se excluye explícitamente? El panel de detalle de movimiento sí la tiene, así que su ausencia aquí debe ser una decisión escrita, no un olvido. [Gap, Spec §US2]
- [x] CHK006 - ¿Está definida la **retroalimentación de éxito** al crear, editar, pagar, deshacer y eliminar (mensaje, ubicación, duración)? [Gap]
- [x] CHK007 - ¿Están definidos los estados **en vuelo** (botón deshabilitado, indicador de progreso) mientras un pago se confirma? [Gap, Spec §FR-018]
- [x] CHK008 - ¿Está especificado qué muestra la fila de un plan **sin tarjeta** en la columna Tarjeta? [Gap, Spec §FR-002]

## Requirement Clarity

- [x] CHK009 - ¿Está definido si el indicador «cuota de este mes» cuenta las cuotas de este mes **ya pagadas** o sólo las pendientes? Las dos lecturas dan cifras distintas. [Ambiguity, Spec §FR-004]
- [x] CHK010 - ¿Está definido si «este mes» es el mes calendario o el ciclo de facturación configurado del usuario? [Ambiguity, Spec §FR-004]
- [x] CHK011 - ¿Está definido cómo se combinan el filtro de estado y el de «próximos 3 meses» — se intersecan o se excluyen entre sí? [Ambiguity, Spec §FR-008, §FR-009]
- [x] CHK012 - ¿Está cuantificado qué campos concretos conserva la tarjeta de tablet? «sin columnas de detalle» no dice cuáles sobreviven. [Clarity, Spec §FR-055]
- [x] CHK013 - ¿Es medible «la lista de fondo mantiene su orden, su ancho y su posición de scroll», o requiere una definición operativa? [Measurability, Spec §FR-012]
- [x] CHK014 - ¿Está definido cómo se muestra el arrastre **por separado** del monto programado (fila propia, texto anexo, monto compuesto)? [Clarity, Spec §FR-022]
- [x] CHK015 - ¿Está definido el texto o la forma con que el detalle «explica» por qué un plan con tarjeta de crédito no genera movimiento? [Clarity, Spec §FR-036]
  - **Resuelto (2026-08-22):** nota fija con ícono informativo en el panel de detalle, clave
    `installments.detail.creditCardNotice`: «Las cuotas de este plan no generan movimiento: la compra
    ya está registrada en la facturación de su tarjeta de crédito.» El formulario de pago repite la
    idea en la fila de cuenta (`installments.pay.noMovement`).

## Requirement Consistency

- [x] CHK016 - ¿Concuerdan los cuatro indicadores de FR-004 con la separación por moneda de FR-005? Un encabezado de cuatro cifras multiplicado por N monedas necesita una regla de presentación que no está escrita. [Conflict, Spec §FR-004 vs §FR-005]
- [x] CHK017 - ¿Son consistentes los requisitos de panel lateral con los patrones ya establecidos del repositorio (detalle de movimiento, pago de facturación), o introducen una variante nueva? [Consistency, Spec §FR-011]
- [x] CHK018 - ¿Coinciden los estados de plan de FR-003 (OVERDUE/DUE_SOON/ON_TRACK/PAID) con los estados que las historias de usuario nombran en prosa? [Consistency, Spec §FR-003 vs §US1]

## Scenario & Edge Case Coverage

- [x] CHK019 - ¿Está definida cuál es la «acción principal fijada al pie» en móvil para un plan **ya completado**, que no tiene nada que pagar? [Edge Case, Spec §FR-054]
- [x] CHK020 - ¿Están definidos los requisitos de presentación para un plan con **muchas cuotas** (p. ej. 60)? La lista de cuotas del panel puede volverse muy larga. [Coverage, Gap]
- [x] CHK021 - ¿Está definido qué muestra la fila cuando el plan tiene una cuota **parcialmente pagada** (el caso de FR-023)? El estado no está en el enum de FR-003. [Gap, Conflict, Spec §FR-003 vs §FR-023]
- [x] CHK022 - ¿Están definidos los requisitos para un título de plan muy largo o una categoría muy larga en cada formato? [Edge Case, Gap]

## Traceability & Measurability

- [x] CHK023 - ¿Cada criterio de éxito SC-001..SC-011 se puede evaluar sin conocer la implementación? [Measurability, Spec §Success Criteria]
- [x] CHK024 - ¿Está establecido que los umbrales de formato provienen de la escala estipulada del proyecto y no de píxeles inventados? [Traceability, Spec §FR-054..§FR-056]

## Notes

- **Resultado de la revisión: 23/24 resueltos** mediante las precisiones FR-001a..FR-058c añadidas a
  la spec. Queda abierto CHK015 (la redacción exacta del aviso sobre la tarjeta de crédito): es
  literalmente el texto de una etiqueta, y se decide al escribir los catálogos es/en.
- Marca con `[x]` lo resuelto; anota debajo del ítem la decisión tomada.
- CHK009, CHK011, CHK016 y CHK021 son los que más probablemente cambien el trabajo si se resuelven
  tarde: los tres afectan qué número se muestra o qué estado existe, no cómo se ve.
- CHK021 marca una **contradicción real** entre dos requisitos ya escritos, no un hueco: si una cuota
  puede quedar parcialmente pagada (FR-023), el enum de cuatro estados de FR-003 no la puede
  representar.
