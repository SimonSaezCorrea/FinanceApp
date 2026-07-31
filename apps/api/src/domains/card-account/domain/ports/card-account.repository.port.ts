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
  create(userId: string, accountId: string, plan: CardPlan): Promise<string>;
  update(cardId: string, plan: CardPlan): Promise<void>;
  remove(userId: string, accountId: string, cardId: string): Promise<boolean>;
}
