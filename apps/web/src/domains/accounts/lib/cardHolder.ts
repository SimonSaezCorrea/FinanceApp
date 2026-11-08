import type { accounts } from "@finance/contracts";

/**
 * The name a card's spending belongs to: an ADDITIONAL card issued to someone else carries that
 * person's name; any other card (and an additional card whose holder was left blank) is the
 * owner's, `null`.
 */
export function cardHolderOf(card: accounts.Card | undefined): string | null {
  if (!card?.isAdditional) return null;
  const name = card.cardholderName?.trim();
  return name ? name : null;
}
