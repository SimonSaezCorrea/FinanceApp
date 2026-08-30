import type { accounts } from "@finance/contracts";

import type { CardPlan, CardProps } from "../card-account.entity";

export const CARD_ACCOUNT_REPOSITORY = Symbol("CARD_ACCOUNT_REPOSITORY");

/**
 * Port for the `card-account` table only (Adapter, FR-011). Reads hydrate each
 * card's `limits` by composing the `card-limit` port — one table per adapter,
 * joined in the adapter, never by a second adapter reaching into a table it
 * doesn't own.
 */
export interface CardAccountRepositoryPort {
  listByAccounts(accountIds: string[]): Promise<(CardProps & { accountId: string })[]>;
  findOnAccount(userId: string, accountId: string, cardId: string): Promise<CardProps | null>;
  /** Whether this card belongs to the user, regardless of which account it's on
   * — used by `wallet-item-dashboard` to validate a pinned card. */
  existsForUser(userId: string, cardId: string): Promise<boolean>;
  /** The account a card belongs to — a card is always ON one, and a caller that
   * only holds the card id (an installment plan) needs it to reach the pool. */
  accountIdForCard(userId: string, cardId: string): Promise<string | null>;
  /** A card's kind. An installment plan needs it to know whether paying one of its
   * installments records a real movement: a CREDIT card's purchase is already in its
   * own statement, so recording it again would count the debt twice (FR-035). */
  kindForCard(userId: string, cardId: string): Promise<accounts.CardKind | null>;
  create(userId: string, accountId: string, plan: CardPlan): Promise<string>;
  update(cardId: string, plan: CardPlan): Promise<void>;
  remove(userId: string, accountId: string, cardId: string): Promise<boolean>;
}
