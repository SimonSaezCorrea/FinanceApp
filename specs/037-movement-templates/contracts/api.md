# API contract: movement templates (037)

All routes under `/api/v1`, `JwtAuthGuard`, scoped by the caller. Zod schemas in
`packages/contracts/src/movement-templates/index.ts` (exported as `movementTemplates`).

## `GET /movement-templates` → `200 MovementTemplate[]` (ordered by name)

```ts
MovementTemplate = {
  id: rowId; name: string; type: "EXPENSE" | "INCOME";
  amount: moneyString | null; currency: string | null;
  bankAccountId: rowId | null; cardId: rowId | null; categoryId: rowId | null;
  recurringExpenseId: rowId | null;
  description, observation, emisor, receptor, lugar: string | null;
  financeCharge: boolean;
  customFields: Record<rowId, boolean | string>; // only fields that still exist
}
```

## `POST /movement-templates` → `201 MovementTemplate`

Body `SaveMovementTemplate`:

```ts
{ name: string(1..60); type; amount?: positive moneyString; currency?: string(3);
  bankAccountId?: rowId; cardId?: rowId; categoryId?: rowId; recurringExpenseId?: rowId;
  description?, observation?: ≤500; emisor?, receptor?, lugar?: ≤200;
  financeCharge?: boolean; customFields?: Record<rowId, boolean | string> }
```

Refines: `amount ⇒ currency`, `cardId ⇒ bankAccountId`, `financeCharge ⇒ EXPENSE ∧ !cardId`.

Errors: `400 VALIDATION_FAILED`/`INVALID_ID_FORMAT`; `404 ACCOUNT_NOT_FOUND | CARD_NOT_FOUND |
RECURRING_NOT_FOUND | CUSTOM_FIELD_NOT_FOUND | CATEGORY_NOT_FOUND`; `400 CATEGORY_NOT_ALLOWED |
CUSTOM_FIELD_INVALID_VALUE`; `409 MOVEMENT_TEMPLATE_NAME_TAKEN | MOVEMENT_TEMPLATE_LIMIT_REACHED`.

## `PUT /movement-templates/:id` → `200 MovementTemplate`

Same body and errors as POST (minus the limit); full replacement. Foreign/unknown id →
`404 MOVEMENT_TEMPLATE_NOT_FOUND`.

## `DELETE /movement-templates/:id` → `204`

Foreign/unknown id → `404 MOVEMENT_TEMPLATE_NOT_FOUND`.

Using a template creates nothing server-side: the web pre-fills the form and saves with the
existing `POST /transactions`.
