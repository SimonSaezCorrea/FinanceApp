import type { accounts } from "@finance/contracts";

import type { BankAccount } from "../bank-account.aggregate";

export const BANK_ACCOUNT_REPOSITORY = Symbol("BANK_ACCOUNT_REPOSITORY");

export type CreateCardPlan = {
  name: string;
  kind: accounts.CardKind;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isActive: boolean;
  isPrimary: boolean;
  limits: { currency: string; limitAmount: string; usedInitial: string }[];
};

export type CreateAccountPlan = {
  name: string;
  type: accounts.AccountType;
  status: accounts.AccountStatus;
  currency: string;
  institution: string | null;
  institutionId: string | null;
  accountNumber: string | null | undefined;
  initialBalance: string;
  creditLimit: string;
  creditUsedInitial: string;
  billingCycleDay: number | null;
  paymentMethod: accounts.BillingPaymentMethod;
  cards: CreateCardPlan[];
};

/**
 * Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named operations
 * only, not a generic CRUD surface.
 */
export interface BankAccountRepositoryPort {
  findById(userId: string, id: string): Promise<BankAccount | null>;
  listByUser(userId: string, where: { status?: accounts.AccountStatus }): Promise<BankAccount[]>;
  /** System-wide: every account (any user) with a billing day configured — the
   * cron's universe, not a per-request scoped query. */
  listDueForBilling(): Promise<BankAccount[]>;
  institutionName(id: string): Promise<string | null>;
  createWithCards(userId: string, plan: CreateAccountPlan): Promise<BankAccount>;
  /** Persists the account's own scalar fields (never its cards — those go
   * through addCard/updateCard/removeCard so existing transaction links to a
   * card are never disturbed by an unrelated account-field save). */
  save(aggregate: BankAccount): Promise<void>;
  saveWithTx(tx: unknown, aggregate: BankAccount): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
  addCard(userId: string, accountId: string, plan: CreateCardPlan): Promise<BankAccount>;
  updateCard(userId: string, accountId: string, cardId: string, plan: CreateCardPlan): Promise<BankAccount | null>;
  removeCard(userId: string, accountId: string, cardId: string): Promise<boolean>;
  /** Σ transactions by type, scoped to user+account — for `reconcileBalance`. */
  sumByType(userId: string, accountId: string): Promise<{ income: string; expense: string }>;
  /** Linked transactions since `since`, scoped to user+accounts — for the
   * balance-series read model. */
  txWindow(
    userId: string,
    accountIds: string[],
    since: Date,
  ): Promise<{ bankAccountId: string | null; type: "INCOME" | "EXPENSE"; amount: { toString(): string }; occurredAt: Date }[]>;
  /** Σ amount by (card, currency, type) — for a card's own `used`/`ownUsed`. */
  cardSums(
    userId: string,
    cardsInfo: { id: string; billingCycleDay: number | null }[],
  ): Promise<{ cardId: string | null; currency: string; type: "INCOME" | "EXPENSE"; sum: string }[]>;
}
