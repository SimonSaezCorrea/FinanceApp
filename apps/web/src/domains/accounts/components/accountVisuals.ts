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
