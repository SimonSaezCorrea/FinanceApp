import type { accounts } from "@finance/contracts";

/**
 * Whether the account detail's side column has anything to hold.
 *
 * The column is 320-480px of the viewport, so reserving it for an account that
 * carries no cards (cash, investment) left the movements table squeezed against
 * an empty half of the screen. It earns its width only when there are cards to
 * list, or more than one credit pool to break down.
 */
export function hasCardsAside(
  account: Pick<accounts.BankAccount, "type" | "creditPools">,
  isCardable: boolean,
): boolean {
  return isCardable || account.creditPools.length > 1;
}
