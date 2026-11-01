import type { accounts } from "@finance/contracts";

type CardHolder = Pick<accounts.BankAccount, "cards">;

/**
 * The cards a movement can be recorded with: the active ones. `keepId` is the
 * card a movement already has (editing an old one), kept even when deactivated
 * so the form never drops what was recorded.
 */
export function selectableCards(
  account: CardHolder | undefined,
  keepId?: string | null,
): accounts.Card[] {
  return (account?.cards ?? []).filter((c) => c.isActive || c.id === keepId);
}

/**
 * The card a credit card account's expense starts with: its primary card while
 * it's active, otherwise its first active credit card. "" when none is active.
 */
export function defaultCardId(account: CardHolder | undefined): string {
  const active = selectableCards(account);
  return (
    active.find((c) => c.kind === "CREDIT" && c.isPrimary)?.id ??
    active.find((c) => c.kind === "CREDIT")?.id ??
    ""
  );
}
