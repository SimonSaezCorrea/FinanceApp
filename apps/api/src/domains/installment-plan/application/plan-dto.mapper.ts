import type { accounts, installments } from "@finance/contracts";

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
  cards: Pick<CardAccountRepositoryPort, "kindForCard">,
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

  return plans.map((plan) => {
    const cardId = plan.snapshot().cardId;
    return plan.toContract({ now, cardKind: cardId ? (kinds.get(cardId) ?? null) : null });
  });
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
