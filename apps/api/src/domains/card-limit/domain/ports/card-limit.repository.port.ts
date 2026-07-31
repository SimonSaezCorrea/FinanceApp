import type { CardLimitPlan, CardLimitProps } from "../card-limit.entity";

export const CARD_LIMIT_REPOSITORY = Symbol("CARD_LIMIT_REPOSITORY");

/**
 * Port for the `card-limit` table only (Adapter, FR-011). Named operations, not
 * generic CRUD: a limit is always addressed through the card that owns it.
 */
export interface CardLimitRepositoryPort {
  listByCards(cardIds: string[]): Promise<(CardLimitProps & { cardId: string })[]>;
  /** The card's own sub-limit for one currency, if it has one — the narrower cap
   * the `transaction` domain checks a movement against. */
  findForCardCurrency(userId: string, cardId: string, currency: string): Promise<CardLimitProps | null>;
  createForCard(cardId: string, limits: CardLimitPlan[]): Promise<void>;
  /** Replaces every limit row of a card in one go (edit path). */
  replaceForCard(cardId: string, limits: CardLimitPlan[]): Promise<void>;
}
