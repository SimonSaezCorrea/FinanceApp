import { addMoney } from "@finance/money";

import type { imports } from "@finance/contracts";

import { cashDelta } from "../../transaction/domain/balance-delta";
import { CardAccountMismatchError } from "../../transaction/domain/errors";
import type {
  AccountContext,
  CardContext,
  CardLimitContext,
} from "../../transaction/domain/movement-policy";
import { MovementPolicy } from "../../transaction/domain/movement-policy";
import { ImportRowRejectedError } from "./errors";

/** One card of the account being imported into, with what its own rules need. */
export interface ImportCard extends CardContext {
  isPrimary: boolean;
  /** Its own sub-limit in the account's currency, when it has one — then it
   * stays out of the shared pool and is capped by this instead. */
  limit: CardLimitContext | null;
  /** What it has already used against that sub-limit. */
  usage: { income: string; expense: string };
}

/** One row, ready for the bulk insert. */
export interface PlannedImportRow {
  type: imports.ImportRow["type"];
  amount: string;
  occurredAt: Date;
  description: string | null;
  observation: string | null;
  emisor: string | null;
  receptor: string | null;
  lugar: string | null;
  categoryId: string | null;
  cardId: string | null;
  financeCharge: boolean;
  /** Whether it draws on the credit pool — the caller links those rows to the
   * account's open billing period. */
  drawsOnCredit: boolean;
}

export interface ImportPlan {
  rows: PlannedImportRow[];
  /** Σ of what the rows do to `currentBalance` — applied once. */
  cashTotal: string;
  /** Σ of what the rows do to `creditUsed` — applied once. */
  creditTotal: string;
}

const text = (value: string | undefined): string | null => value?.trim() || null;

/**
 * Plans an import onto ONE account as if each row were created by hand, in order:
 * every row goes through `MovementPolicy` against the balance, credit pool and
 * card sub-limits the PREVIOUS rows already left — so a prepaid account can't be
 * taken below zero by the tenth row just because each row alone would fit, and an
 * overdraft line or a credit limit is enforced on the running total.
 *
 * A row may name a card; it must be one of THIS account's (`CARD_ACCOUNT_MISMATCH`).
 * On a CREDIT_CARD account an expense that names none (and isn't an issuer
 * charge) goes on the primary card, since a statement rarely says which plastic
 * made it. A rejected row fails the WHOLE import (`ImportRowRejectedError`,
 * carrying the row's index): all-or-nothing.
 *
 * Pure: no I/O, the caller loads `account`/`cards` and persists the result.
 */
export function planImport(
  rows: imports.ImportRow[],
  account: AccountContext & { currency: string },
  cards: ImportCard[],
): ImportPlan {
  // Running copies: each row is validated against what the previous ones left.
  const running: AccountContext = { ...account };
  const cardUsage = new Map(cards.map((c) => [c.id, { ...c.usage }]));
  const primary = cards.find((c) => c.kind === "CREDIT" && c.isPrimary) ?? null;
  let cashTotal = "0";
  let creditTotal = "0";
  const planned: PlannedImportRow[] = [];

  rows.forEach((row, index) => {
    const financeCharge = row.financeCharge ?? false;
    let card: ImportCard | null = null;
    let contribution: string;
    try {
      if (row.cardId) {
        card = cards.find((c) => c.id === row.cardId) ?? null;
        if (!card) throw new CardAccountMismatchError();
      } else if (account.type === "CREDIT_CARD" && row.type === "EXPENSE" && !financeCharge) {
        card = primary;
      }
      const usage = card ? cardUsage.get(card.id)! : { income: "0", expense: "0" };
      contribution = MovementPolicy.validate(
        {
          type: row.type,
          bankAccountId: account.id,
          cardId: card?.id ?? null,
          amount: row.amount,
          currency: account.currency,
          financeCharge,
        },
        running,
        card,
        card?.kind === "CREDIT" ? card.limit : null,
        usage,
      );
    } catch (error) {
      throw ImportRowRejectedError.from(error, index);
    }

    const cash = cashDelta(row.type, row.amount, account, card);
    running.currentBalance = addMoney(running.currentBalance, cash);
    running.creditUsed = addMoney(running.creditUsed, contribution);
    cashTotal = addMoney(cashTotal, cash);
    creditTotal = addMoney(creditTotal, contribution);
    // A card with its own sub-limit keeps its own running usage.
    if (card?.limit) {
      const usage = cardUsage.get(card.id)!;
      if (row.type === "EXPENSE") usage.expense = addMoney(usage.expense, row.amount);
      else usage.income = addMoney(usage.income, row.amount);
    }

    planned.push({
      type: row.type,
      amount: row.amount,
      occurredAt: new Date(row.occurredAt),
      description: text(row.description),
      observation: text(row.observation),
      emisor: text(row.emisor),
      receptor: text(row.receptor),
      lugar: text(row.lugar),
      categoryId: row.categoryId ?? null,
      cardId: card?.id ?? null,
      financeCharge,
      drawsOnCredit: Number(contribution) !== 0,
    });
  });

  return { rows: planned, cashTotal, creditTotal };
}
