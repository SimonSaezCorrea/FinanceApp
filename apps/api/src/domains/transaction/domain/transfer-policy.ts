import { toMoney } from "@finance/money";

import {
  CardNotAllowedError,
  InvalidAmountError,
  PrepaidInsufficientBalanceError,
  TransferAccountNotFoundError,
  TransferSameAccountError,
  TransferToCreditAccountError,
} from "./errors";

/** The little a transfer needs to know about each of its two accounts. */
export interface TransferAccountContext {
  id: string;
  type: string;
  /** Only read for a PREPAID source: its outgoing leg is bounded by it, exactly
   * like an expense would be (the rule belongs to the product, not the channel). */
  currentBalance?: string;
}

export interface TransferInput {
  fromBankAccountId: string;
  toBankAccountId: string;
  amountOut: string;
  amountIn: string;
  /** Never allowed on either leg (FR-019) — a transfer touches no credit pool. */
  cardId?: string | null;
}

/**
 * The rules of a transfer, as a pure policy (mirrors `MovementPolicy`).
 *
 * Deliberately absent: any comparison between the two currencies. Each leg is
 * denominated in its own account's currency and the user states both figures —
 * this app performs no FX conversion and inventing one here would be a lie the
 * balances would then carry.
 */
export const TransferPolicy = {
  validate(
    input: TransferInput,
    from: TransferAccountContext | null,
    to: TransferAccountContext | null,
    /** On an edit, what this same transfer already took off the source account. */
    outgoingOffset = "0",
  ): void {
    if (input.fromBankAccountId === input.toBankAccountId) throw new TransferSameAccountError();
    if (!from || !to) throw new TransferAccountNotFoundError();
    if (to.type === "CREDIT_CARD") throw new TransferToCreditAccountError();
    if (input.cardId) throw new CardNotAllowedError();
    if (toMoney(input.amountOut).lte(0) || toMoney(input.amountIn).lte(0)) {
      throw new InvalidAmountError();
    }
    // A prepaid account never goes negative, whatever takes the money out of it.
    if (from.type === "PREPAID") {
      const available = toMoney(from.currentBalance ?? "0").plus(toMoney(outgoingOffset));
      if (toMoney(input.amountOut).greaterThan(available)) {
        throw new PrepaidInsufficientBalanceError();
      }
    }
  },
};
