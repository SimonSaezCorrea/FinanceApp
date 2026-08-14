import { toMoney } from "@finance/money";

import {
  CardNotAllowedError,
  InvalidAmountError,
  TransferAccountNotFoundError,
  TransferSameAccountError,
  TransferToCreditAccountError,
} from "./errors";

/** The little a transfer needs to know about each of its two accounts. */
export interface TransferAccountContext {
  id: string;
  type: string;
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
  ): void {
    if (input.fromBankAccountId === input.toBankAccountId) throw new TransferSameAccountError();
    if (!from || !to) throw new TransferAccountNotFoundError();
    if (to.type === "CREDIT_LINE") throw new TransferToCreditAccountError();
    if (input.cardId) throw new CardNotAllowedError();
    if (toMoney(input.amountOut).lte(0) || toMoney(input.amountIn).lte(0)) {
      throw new InvalidAmountError();
    }
  },
};
