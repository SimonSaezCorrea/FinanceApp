import {
  Banknote,
  CreditCard,
  Landmark,
  LineChart,
  type LucideIcon,
  PiggyBank,
  Wallet,
} from "lucide-react";

import type { accounts } from "@finance/contracts";

/** Icon per account type (Lucide). */
export const ACCOUNT_ICON: Record<accounts.AccountType, LucideIcon> = {
  CHECKING: Landmark,
  SIGHT: Wallet,
  SAVINGS: PiggyBank,
  INVESTMENT: LineChart,
  CREDIT_LINE: CreditCard,
  CASH: Banknote,
};

/** Whether an account is a credit line (a standalone credit card; uses "cupo"). */
export function isCreditType(type: accounts.AccountType): boolean {
  return type === "CREDIT_LINE";
}

/**
 * Flat surface + ink per card kind, one pair per theme (see the --credit-surface/
 * --credit-ink family in index.css). No gradient: it existed to give photographic
 * depth, and with no photo it only muddied the light theme. The border rides the
 * ink's own hue at /45 — against flat, low-contrast surfaces a /35 border
 * disappears. Shared by every card-visual tile (draft cards, account detail).
 */
/**
 * An INACTIVE card, whatever its kind: it loses its ink and falls to a muted
 * surface. Colour is what identifies a card at a glance in this app, so a card
 * that can no longer be used must not keep the same one — it reads as available
 * when it isn't. No `grayscale` filter: with flat surfaces there is nothing left
 * to desaturate. The tile stays fully legible (its history still matters).
 */
export const CARD_INACTIVE_STYLE = "border border-border bg-muted text-muted-foreground";

export const CARD_KIND_STYLE: Record<accounts.CardKind, string> = {
  CREDIT:
    "border border-[hsl(var(--credit-ink)/0.45)] bg-[hsl(var(--credit-surface))] text-[hsl(var(--credit-ink))]",
  DEBIT:
    "border border-[hsl(var(--debit-ink)/0.45)] bg-[hsl(var(--debit-surface))] text-[hsl(var(--debit-ink))]",
  PREPAID:
    "border border-[hsl(var(--prepaid-ink)/0.45)] bg-[hsl(var(--prepaid-surface))] text-[hsl(var(--prepaid-ink))]",
};
