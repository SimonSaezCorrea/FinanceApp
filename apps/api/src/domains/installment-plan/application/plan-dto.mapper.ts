import type { accounts, installments } from "@finance/contracts";

import type { BankAccountRepositoryPort } from "../../bank-account/domain/ports/bank-account.repository.port";
import type { CardAccountRepositoryPort } from "../../card-account/domain/ports/card-account.repository.port";
import type { InstallmentPlan } from "../domain/installment-plan.aggregate";

/**
 * Builds the contract DTO for one or many plans.
 *
 * It exists so the list query and the detail query cannot drift: both need the card's
 * `kind` to decide `generatesMovementOnPay` (FR-035), and both must derive their
 * figures against the SAME `now` — a plan that reads DUE_SOON in the list and
 * ON_TRACK in its own panel would be a bug nobody could reproduce.
 *
 * The kinds are fetched in one pass over the distinct card ids rather than per plan:
 * a user with twelve plans on the same card should not cost twelve queries.
 */
export async function toPlanDtos(
  plans: InstallmentPlan[],
  userId: string,
  cards: Pick<CardAccountRepositoryPort, "kindForCard" | "accountIdForCard">,
  accounts_: Pick<BankAccountRepositoryPort, "findById">,
  now: Date = new Date(),
): Promise<installments.InstallmentPlan[]> {
  const cardIds = [...new Set(plans.map((p) => p.snapshot().cardId).filter((id) => id !== null))];
  const kinds = new Map<string, accounts.CardKind | null>(
    await Promise.all(
      cardIds.map(
        async (id) =>
          [id, await cards.kindForCard(userId, id)] as [string, accounts.CardKind | null],
      ),
    ),
  );

  return Promise.all(
    plans.map(async (plan) => {
      const snap = plan.snapshot();
      const cardKind = snap.cardId ? (kinds.get(snap.cardId) ?? null) : null;
      const billingWarning = await billingWarningFor(plan, cardKind, userId, cards, accounts_);
      return plan.toContract({ now, cardKind, billingWarning });
    }),
  );
}

/**
 * Spec 014, FR-009a/FR-023a: why a credit-card plan's instalments cannot reach a
 * statement, when something blocks them. Null when nothing is wrong.
 *
 * `CARD_REMOVED` is derived from a heuristic, not a stored fact: `InstallmentPlan
.cardId` is `SetNull` on the card's deletion, so a plan that lost its card looks
 * identical to one that never had one — EXCEPT it can only have billed an
 * instalment if a CREDIT card once existed on it. `hasBilledInstalment()` is that
 * signal.
 */
async function billingWarningFor(
  plan: InstallmentPlan,
  cardKind: accounts.CardKind | null,
  userId: string,
  cards: Pick<CardAccountRepositoryPort, "accountIdForCard">,
  accounts_: Pick<BankAccountRepositoryPort, "findById">,
): Promise<installments.PlanBillingWarning | null> {
  const snap = plan.snapshot();
  if (cardKind !== "CREDIT") {
    if (snap.cardId === null && plan.hasBilledInstalment()) return "CARD_REMOVED";
    return null;
  }
  const accountId = await cards.accountIdForCard(userId, snap.cardId!);
  if (!accountId) return null;
  const account = await accounts_.findById(userId, accountId);
  if (!account) return null;
  if (!account.billingCycleDay) return "NO_BILLING_DAY";
  if (account.currency !== snap.currency) return "CURRENCY_MISMATCH";
  return null;
}

/**
 * The detail DTO: the same figures plus what deleting the plan would undo (FR-050b).
 *
 * Only here, never in the list: the impact costs one read of the plan's movements
 * plus one per account behind them, and its only consumer is the delete confirmation
 * — which always has exactly one plan open.
 */
export function withDeletionImpact(
  dto: installments.InstallmentPlan,
  reversal: {
    movementIds: string[];
    balanceRestorations: { accountId: string; amount: string; currency: string }[];
  },
): installments.InstallmentPlan {
  return {
    ...dto,
    deletionImpact: {
      movementCount: reversal.movementIds.length,
      balanceRestorations: reversal.balanceRestorations,
    },
  };
}
