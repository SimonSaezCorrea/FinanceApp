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
 * Deep, moody gradients (not light-to-bright) — a fixed "photograph" identity per
 * card kind, same across both app themes (see the --brand-deep, --debit-from,
 * --debit-to, --prepaid-from and --prepaid-to tokens in index.css). Shared by
 * every card-visual tile (draft cards, account detail).
 */
export const CARD_KIND_STYLE: Record<accounts.CardKind, string> = {
  CREDIT:
    "border border-primary/35 bg-[linear-gradient(150deg,hsl(var(--brand)),hsl(var(--brand-deep)))] text-credit-ink",
  DEBIT:
    "border border-accent/35 bg-[linear-gradient(150deg,hsl(var(--debit-from)),hsl(var(--debit-to)))] text-debit-ink",
  PREPAID:
    "border border-muted-foreground/30 bg-[linear-gradient(150deg,hsl(var(--prepaid-from)),hsl(var(--prepaid-to)))] text-prepaid-ink",
};
