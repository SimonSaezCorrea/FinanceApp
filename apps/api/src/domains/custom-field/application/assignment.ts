import { customFields } from "@finance/contracts";

import type { CardAccountRepositoryPort } from "../../card-account/domain/ports/card-account.repository.port";
import type {
  FieldValue,
  TransactionFieldValueRepositoryPort,
} from "../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import { resolveListFilter } from "../../transaction/application/queries/transaction-list-filter";
import type { TransactionScopeLookupPort } from "../../transaction/domain/ports/transaction-scope-lookup.port";
import type { CustomField } from "../domain/custom-field.aggregate";
import { CustomFieldAssignmentTooLargeError } from "../domain/errors";
import type { CustomFieldRepositoryPort } from "../domain/ports/custom-field.repository.port";
import { shapeOf } from "./scope";

export interface AssignmentDeps {
  fields: CustomFieldRepositoryPort;
  values: TransactionFieldValueRepositoryPort;
  movements: TransactionScopeLookupPort;
  cards: CardAccountRepositoryPort;
}

/** What a bulk assignment works on: the movements the field applies to, the ones it
 * leaves out, and what each in-scope one holds today. */
export interface AssignmentPlan {
  inScope: string[];
  outOfScope: number;
  current: Map<string, FieldValue>;
}

/**
 * Resolves a bulk action's target (FR-015/016) — the ids picked, or every movement
 * of a Movimientos filter — to the person's own movements (a foreign id simply
 * isn't returned, Principle II), split by whether the field applies to them.
 */
export async function planAssignment(
  deps: AssignmentDeps,
  userId: string,
  field: CustomField,
  target: customFields.AssignmentTarget,
): Promise<AssignmentPlan> {
  const max = customFields.CUSTOM_FIELD_ASSIGNMENT_MAX;
  let ids: string[];
  if ("ids" in target) {
    ids = [...new Set(target.ids)];
  } else {
    const where = await resolveListFilter(
      { fields: deps.fields, values: deps.values, cards: deps.cards },
      userId,
      target.filter,
    );
    const except = new Set(target.exceptIds ?? []);
    ids = (await deps.movements.idsForFilter(userId, where, max + 1 + except.size)).filter(
      (id) => !except.has(id),
    );
  }
  if (ids.length > max) throw new CustomFieldAssignmentTooLargeError();

  const [facts, cardKinds] = await Promise.all([
    deps.movements.factsFor(userId, ids),
    deps.cards.kindsForUser(userId),
  ]);
  const inScope = facts.filter((f) => field.appliesTo(shapeOf(f, cardKinds))).map((f) => f.id);
  const stored = await deps.values.valuesFor(userId, field.id, inScope);
  const current = new Map([...stored].map(([id, v]) => [id, v.value]));
  return { inScope, outOfScope: facts.length - inScope.length, current };
}

/** The in-scope movements whose value would actually change. */
export function changedBy(plan: AssignmentPlan, value: FieldValue | null): string[] {
  return plan.inScope.filter((id) => (plan.current.get(id) ?? null) !== value);
}
