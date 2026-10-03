import type { imports } from "@finance/contracts";

import { currentCycleStart } from "../../billing-settings/domain/billing-cycle";
import type { BankAccountRepositoryPort } from "../../bank-account/domain/ports/bank-account.repository.port";
import { assertSelectableCategory } from "../../category/domain/category-policy";
import type { CategoryLookupPort } from "../../category/domain/ports/category-lookup.port";
import type { TransactionRepositoryPort } from "../../transaction/domain/ports/transaction.repository.port";
import type { TemplateCard, TemplateLookup } from "../domain/template-plan";

export interface TemplateContext {
  lookup: TemplateLookup;
  /** Each account's own creation date — the fallback start of its very first
   * billing period, which `credit-statement` can't read for itself. */
  createdAt: Map<string, Date>;
}

/**
 * Loads what `planTemplateImport` needs to judge a template, and nothing else.
 *
 * Ownership (Principle II) comes for free from the query itself: the lookup maps
 * hold ONLY the user's own accounts and cards, so any id in the body that isn't
 * theirs is simply absent — and the planner reports it as not found, never as
 * "no card"/"no account".
 *
 * Read-only by construction: it never opens a billing period or writes anything
 * (research R9) — the preview runs exactly this, and must not change the data.
 */
export async function loadTemplateContext(
  deps: {
    accounts: BankAccountRepositoryPort;
    movements: TransactionRepositoryPort;
    categories: CategoryLookupPort;
  },
  userId: string,
  req: imports.TemplateImportRequest,
): Promise<TemplateContext> {
  const owned = await deps.accounts.listByUser(userId, {});
  const lookup: TemplateLookup = {
    accounts: new Map(),
    cards: new Map(),
    categoryErrors: new Map(),
  };
  const createdAt = new Map<string, Date>();
  const now = new Date();

  for (const account of owned) {
    const snap = account.snapshot();
    lookup.accounts.set(snap.id, {
      context: {
        id: snap.id,
        type: snap.type,
        currentBalance: account.currentBalance,
        overdraftLimit: snap.overdraftLimit,
        balanceCeiling: snap.balanceCeiling,
        creditLimit: account.creditLimit,
        creditUsed: account.creditUsed,
        billingCycleDay: snap.billingCycleDay,
        billingCycleType: snap.billingCycleType,
        currency: snap.currency,
      },
      currency: snap.currency,
      status: snap.status,
    });
    createdAt.set(snap.id, snap.createdAt);

    const since = currentCycleStart(snap.billingCycleDay, snap.billingCycleType, now);
    for (const card of account.cards) {
      // A CREDIT card with its own sub-limit in the account's currency is capped by
      // it AND by the account's pool, which its spending still uses — same inputs a
      // single movement loads (`ImportTransactionsHandler.accountCards`).
      const own =
        card.kind === "CREDIT"
          ? (card.limits.find((l) => l.currency === snap.currency) ?? null)
          : null;
      const usage = own
        ? await deps.movements.sumsForCard(userId, card.id, snap.currency, since, undefined, true)
        : { income: "0", expense: "0" };
      // Its limits in other currencies (a CLP card's USD one): a movement in that
      // currency goes against them, never the account's pool.
      const otherLimits: TemplateCard["otherLimits"] = {};
      if (card.kind === "CREDIT") {
        for (const l of card.limits.filter((x) => x.currency !== snap.currency)) {
          otherLimits[l.currency] = {
            limit: { limitAmount: l.limitAmount, usedInitial: l.usedInitial },
            usage: await deps.movements.sumsForCard(userId, card.id, l.currency, since),
          };
        }
      }
      const entry: TemplateCard = {
        id: card.id,
        kind: card.kind,
        isPrimary: card.isPrimary,
        limit: own ? { limitAmount: own.limitAmount, usedInitial: own.usedInitial } : null,
        usage,
        accountId: snap.id,
        otherLimits,
      };
      lookup.cards.set(card.id, entry);
    }
  }

  // Each distinct (category, movement type) once, like the statement importer.
  const checks = new Set<string>();
  for (const m of req.movements) if (m.categoryId) checks.add(`${m.categoryId}|${m.type}`);
  for (const p of req.plans) if (p.categoryId) checks.add(`${p.categoryId}|EXPENSE`);
  for (const r of req.recurring) if (r.categoryId) checks.add(`${r.categoryId}|EXPENSE`);
  for (const check of checks) {
    const [categoryId, type] = check.split("|") as [string, "INCOME" | "EXPENSE"];
    try {
      await assertSelectableCategory(deps.categories, categoryId, type);
    } catch (error) {
      const { code, httpStatus } = error as { code?: unknown; httpStatus?: unknown };
      if (typeof code !== "string" || typeof httpStatus !== "number") throw error;
      lookup.categoryErrors.set(check, { code, status: httpStatus as 400 | 404 | 409 });
    }
  }

  return { lookup, createdAt };
}
