# Phase 1 — Data Model: Vista Cuotas

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Sin tablas nuevas. Cinco columnas nuevas en dos modelos existentes, más un método nuevo en un puerto.

---

## `InstallmentPlan` (tabla `installment-plan`)

| Columna | Tipo | Null | Default | Por qué |
| --- | --- | --- | --- | --- |
| `category` | `String?` | sí | — | FR-051. **Texto libre**, mismo repertorio que `Transaction.category`; de él sale el ícono (FR-052). No participa de ningún cálculo del plan |
| `paymentAccountId` | `String?` FK → `BankAccount` | sí | — | FR-032. La cuenta que prellena el formulario de pago. **`onDelete: SetNull`**: borrar la cuenta no puede borrar la deuda, sólo hace que el formulario vuelva a pedirla (FR-034) |

Relación nueva: `paymentAccount BankAccount? @relation("InstallmentPlanPaymentAccount", fields: [paymentAccountId], references: [id], onDelete: SetNull)`.
Índice nuevo: `@@index([paymentAccountId])`.

> `cardId`, `totalPrincipal`, `installmentCount`, `startDate`, `frequency`, `frequencyInterval`,
> `notes` y la relación `transactions` quedan **sin cambios**.

### Invariantes del agregado

- **INV-P1**: `paymentAccountId` debe apuntar a una cuenta del mismo `userId`. Una cuenta ajena se
  trata como inexistente (404), nunca como prohibida — el precedente es `TRANSFER_ACCOUNT_NOT_FOUND`.
- **INV-P2**: un plan cuya `cardId` apunta a una tarjeta `kind = CREDIT` **no puede** tener
  `paymentAccountId` (FR-037). Error `INSTALLMENT_CARD_IS_CREDIT`.
- **INV-P3**: cambiar `paymentAccountId` no toca ninguna cuota ya pagada (FR-033). Se cumple por
  construcción: el dato vive en el plan y sólo se lee al abrir el formulario de pago.
- **INV-P4** (existente, se conserva): `totalPrincipal`, `installmentCount` y `startDate` son
  inmutables mientras el plan exista; `applyUpdate` sigue sin aceptarlos.

---

## `InstallmentPayment` (tabla `installment-payment`)

| Columna | Tipo | Null | Default | Por qué |
| --- | --- | --- | --- | --- |
| `paidAmount` | `Decimal(18,4)?` | sí | — | FR-019. Lo **realmente** pagado, que puede diferir de `amount`. `null` en una cuota pagada antes de esta feature = "pagada, monto real desconocido" |
| `carriedOverAmount` | `Decimal(18,4)` | no | `0` | FR-021/FR-022. Lo que la cuota **anterior** no cubrió y ésta hereda. **Negativo** cuando la anterior se pagó de más |
| `transactionId` | `String?` FK → `Transaction` | sí | — | FR-025/FR-028. El gasto que respalda esta cuota. **`onDelete: SetNull`**: borrar el movimiento desde Movimientos deja la cuota intacta y deshacible |

Relación nueva: `transaction Transaction? @relation(fields: [transactionId], references: [id], onDelete: SetNull)`.
Índice nuevo: `@@index([transactionId])`.

> `sequence`, `dueDate`, `amount` (monto **programado**) y `paidAt` (que pasa a significar la **fecha
> real** de pago, no la de registro) quedan sin cambios de tipo.

### Campos derivados (nunca almacenados)

| Derivado | Fórmula | Dónde |
| --- | --- | --- |
| `dueAmount` de una cuota | `amount + carriedOverAmount` | contrato (API) |
| `remainingAmount` del plan | `Σ dueAmount de las cuotas impagas` + remanente de una última cuota parcial | contrato (API) |
| `paidTotal` del plan | `Σ (paidAmount ?? amount)` de las cuotas pagadas | contrato (API) |
| Estado del plan | `vencida` / `próxima` (≤7 días) / `al día` / `parcialmente pagado` / `pagado` — FR-003. `parcialmente pagado` cubre el caso de FR-023 (última cuota cubierta sólo en parte) y **cuenta como plan activo** | `@finance/contracts` (`installments.planStatus`), consumido por el web |
| Cuatro cifras del encabezado | agrupadas por moneda sobre la lista completa | web, `lib/installmentMetrics.ts` (R8) |

### Invariantes del agregado

- **INV-C1**: **"pagada" es `paidAt !== null`**, jamás `paidAmount !== null` (R10). Una cuota
  antigua está pagada y tiene `paidAmount = null`.
- **INV-C2**: `paidAmount` debe ser **estrictamente positivo**. Cero o negativo →
  `INVALID_PAYMENT_AMOUNT`; anular un pago es deshacerlo, no pagar cero (edge case de la spec).
- **INV-C3**: pagar una cuota ya pagada → `INSTALLMENT_PAYMENT_ALREADY_PAID`. Es lo que impide el
  doble gasto por doble clic (FR-025).
- **INV-C4**: `Σ carriedOverAmount` del plan más `Σ paidAmount` más lo adeudado por las impagas
  **siempre** iguala `Σ amount` programado. Es la invariante que hace que el arrastre no pierda ni
  invente plata, y la que debe probar el test unitario del arrastre encadenado.
- **INV-C5**: el arrastre se aplica a la **siguiente cuota impaga por `sequence`**, no a la
  siguiente por fecha ni a `sequence + 1` (una cuota intermedia puede estar pagada — la spec permite
  deshacer fuera de orden).
- **INV-C6**: si no existe siguiente cuota impaga, el faltante **no se arrastra**: la cuota queda
  parcialmente pagada y sigue siendo pagable por el remanente (FR-023).

---

## Transiciones de estado de una cuota

```text
                    pagar(monto = adeudado)
   IMPAGA ──────────────────────────────────────────► PAGADA
      │                                                  │
      │  pagar(monto < adeudado) y hay siguiente impaga  │
      ├──────────────────────────────────────────────────┤
      │        (la SIGUIENTE recibe el arrastre)         │
      │                                                  │
      │  pagar(monto < adeudado) y NO hay siguiente      │
      ├──────────────────────► PARCIALMENTE PAGADA ──────┤
      │                         (sigue pagable)          │
      │                                                  │
      └──────────────◄───────────────────────────────────┘
                       deshacer
        (borra el gasto, restituye el saldo, revierte
         el arrastre que ESTE pago provocó)
```

**Lo que `deshacer` NO revierte**: el arrastre que esta cuota **recibió** de la anterior. Ese
arrastre pertenece al pago anterior, que sigue en pie (edge case explícito de la spec).

**PARCIALMENTE PAGADA no es una columna**: se deriva de `paidAt !== null && paidAmount < dueAmount &&
no hay siguiente impaga`. Mismo criterio que la facturación de crédito usa para derivar su estado de
`closedAt`/`paidAt` en vez de almacenarlo.

---

## `Transaction` (tabla `transaction`) — sin columnas nuevas

`installmentPlanId` **ya existe** (hoy la usa el cargo financiero) y el gasto de una cuota también la
lleva, para que sea reconocible desde Movimientos (FR-027). El vínculo fino cuota↔gasto vive del lado
de la cuota (`InstallmentPayment.transactionId`), no aquí (R2).

El gasto creado al pagar una cuota se compone así:

| Campo | Valor |
| --- | --- |
| `type` | `EXPENSE` |
| `bankAccountId` | la cuenta de pago confirmada |
| `amount` | el monto confirmado, **en la moneda de la cuenta** (FR-030) |
| `currency` | la de la **cuenta**, no la del plan (FR-030) |
| `occurredAt` | la fecha confirmada (FR-019) |
| `category` | la del plan, o `null` |
| `description` | el título del plan + el número de cuota |
| `installmentPlanId` | el plan |
| `cardId` | **nunca** — la cuota se paga desde la cuenta, no con un plástico |
| `financeCharge` | `false` (el cargo financiero es otro movimiento, creado al crear el plan) |

---

## Operaciones transaccionales adicionales (revisión de checklists)

**Eliminar un plan** (FR-050a) deja de ser un borrado simple: en un solo `prisma.$transaction` debe
borrar los gastos de todas sus cuotas pagadas, restituir el saldo de cada cuenta afectada (agregado
por cuenta, porque distintas cuotas pueden haberse pagado desde cuentas distintas), borrar el cargo
financiero por interés si existe, y sólo entonces borrar el plan — las cuotas se van solas por
`onDelete: Cascade`. `RemoveInstallmentPlanHandler` gana por tanto el mismo `persist()`
transaccional que el de pago, y el mismo lugar en Complexity Tracking.

Para que la confirmación pueda declarar de antemano el impacto (FR-050b), la consulta de detalle
expone `deletionImpact: { movementCount, balanceRestorations: {accountId, amount}[] }` — derivado,
nunca almacenado.

**Bloquear la edición del movimiento vinculado** (FR-028a) obliga al dominio `transaction` a
preguntar por un dato que no es suyo. Se resuelve como el resto del repositorio: un puerto de sólo
lectura, `InstallmentPaymentLookupPort.isLinkedToPayment(userId, transactionId): Promise<boolean>`,
implementado por el adapter de `installment-payment` y consumido por los comandos de actualizar y
eliminar movimiento. Ningún `include` entre tablas.

## Puerto ampliado

`TransactionWriterRepositoryPort` (dominio `transaction`) gana:

```ts
/** Borra un movimiento creado por otro dominio, dentro de su misma transacción.
 *  Lo necesita deshacer el pago de una cuota: el gasto y el saldo se revierten
 *  juntos o no se revierte ninguno. */
deleteWithTx(tx: unknown, id: string): Promise<void>;
```

`CardAccountRepositoryPort` (dominio `card-account`) gana un lector de `kind` para que
`installment-plan` pueda aplicar INV-P2 sin consultar la tabla ajena (R7).
