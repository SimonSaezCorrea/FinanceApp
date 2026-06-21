import { Banknote, CreditCard, Landmark, type LucideIcon, PiggyBank, Wallet } from "lucide-react";

import type { accounts } from "@finance/contracts";

/** Icon per account type (Lucide). */
export const ACCOUNT_ICON: Record<accounts.AccountType, LucideIcon> = {
  CHECKING: Landmark,
  SAVINGS: PiggyBank,
  VISTA: Wallet,
  CREDIT_CARD: CreditCard,
  DEBIT_CARD: CreditCard,
  CASH: Banknote,
  OTHER: Wallet,
};

/** Whether an account behaves like a credit line (uses card limits / "cupo"). */
export function isCreditType(type: accounts.AccountType): boolean {
  return type === "CREDIT_CARD";
}
