/**
 * Single import surface for every model interface (entity shapes + their
 * create/update inputs + enums) shared across the apps.
 *
 *   import type { BankAccount, Transaction, Debt } from "@finance/contracts/models";
 *
 * These are the API/contract models (what crosses the wire), inferred from the
 * zod schemas in each domain — they are NOT the Prisma persistence models. One
 * source of truth keeps both apps consistent; add a new domain's types here when
 * you create it. Type-only module (no runtime code).
 */

// auth
export type { CurrentUser, LoginRequest, RegisterRequest } from "./auth/index";

// accounts
export type {
  BankAccount,
  CreateBankAccount,
  UpdateBankAccount,
  AccountType,
  AccountStatus,
  AccountFilters,
  Card,
  CreateCard,
  CardKind,
  CardLimit,
} from "./accounts/index";

// transactions
export type {
  Transaction,
  CreateTransaction,
  UpdateTransaction,
  TransactionType,
  TransactionFilters,
} from "./transactions/index";

// installments
export type {
  InstallmentPlan,
  InstallmentPayment,
  CreateInstallmentPlan,
} from "./installments/index";

// debts
export type { Debt, CreateDebt, UpdateDebt, DebtDirection } from "./debts/index";

// savings
export type {
  SavingsGoal,
  CreateSavingsGoal,
  UpdateSavingsGoal,
  SavingsEntry,
  CreateSavingsEntry,
} from "./savings/index";

// investments
export type {
  Investment,
  CreateInvestment,
  UpdateInvestment,
  InvestmentKind,
} from "./investments/index";

// import
export type { ImportRow, ImportTransactionsRequest, ImportResult } from "./import/index";

// common
export type { ApiError } from "./common/errors";
