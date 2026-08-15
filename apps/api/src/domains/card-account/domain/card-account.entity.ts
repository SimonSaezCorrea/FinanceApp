import type { accounts } from "@finance/contracts";

import type { CardLimitPlan, CardLimitProps } from "../../card-limit/domain/card-limit.entity";

/**
 * `card-account` table — the physical payment instrument (plastic). Not an
 * aggregate root: a card only exists under a `BankAccount`, and every rule about
 * whether a card may exist at all (cardable account type, CREDIT cards needing a
 * determinate limit, which card is `isPrimary`) belongs to that aggregate. This
 * domain owns the table's shape and its persistence, nothing more.
 *
 * `last4` is the only part of the PAN that ever reaches the backend; there is no
 * CVV column and never should be.
 */
export interface CardProps {
  id: string;
  name: string;
  kind: accounts.CardKind;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isActive: boolean;
  /** At most one `true` per account — assigned by the `BankAccount` aggregate. */
  isPrimary: boolean;
  /** No plastic: several virtual cards can share one account. */
  isVirtual: boolean;
  /** Issued to another person against the same account/credit line. */
  isAdditional: boolean;
  /** Name on the card, when it isn't the account owner's. */
  cardholderName: string | null;
  network: accounts.CardNetwork | null;
  limits: CardLimitProps[];
}

/** A card row about to be inserted/updated, as resolved by `BankAccount`. */
export type CardPlan = {
  name: string;
  kind: accounts.CardKind;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isActive: boolean;
  isPrimary: boolean;
  /** No plastic: several virtual cards can share one account. */
  isVirtual: boolean;
  /** Issued to another person against the same account/credit line. */
  isAdditional: boolean;
  /** Name on the card, when it isn't the account owner's. */
  cardholderName: string | null;
  network: accounts.CardNetwork | null;
  limits: CardLimitPlan[];
};
