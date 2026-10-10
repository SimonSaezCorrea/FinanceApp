-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_FLIGHT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('RUT', 'DNI', 'PASSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SIGHT', 'SAVINGS', 'INVESTMENT', 'CREDIT_CARD', 'PREPAID', 'CASH');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CardNetwork" AS ENUM ('VISA', 'MASTERCARD', 'AMEX', 'REDCOMPRA', 'OTHER');

-- CreateEnum
CREATE TYPE "CardKind" AS ENUM ('CREDIT', 'DEBIT', 'PREPAID');

-- CreateEnum
CREATE TYPE "BillingPaymentMethod" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "BillingCycleType" AS ENUM ('BUSINESS_DAY', 'CALENDAR_DAY');

-- CreateEnum
CREATE TYPE "InstallmentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "DebtDirection" AS ENUM ('OWED_TO_YOU', 'YOU_OWE');

-- CreateEnum
CREATE TYPE "SavingsGoalCloseDestination" AS ENUM ('WITHDRAW_TO_ACCOUNT', 'FREE_SAVINGS', 'TRANSFER_TO_GOAL');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('EXPENSE', 'INCOME', 'BOTH');

-- CreateEnum
CREATE TYPE "BankCategory" AS ENUM ('ESTABLISHED', 'FOREIGN_BRANCH', 'STATE');

-- CreateEnum
CREATE TYPE "InstitutionKind" AS ENUM ('BANK', 'NON_BANK_ISSUER', 'COOPERATIVE', 'PAYMENT_PROVIDER', 'FUND_MANAGER');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('SENSITIVE_DATA_PROCESSING', 'MINOR_GUARDIAN_AUTHORIZATION');

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('MOTHER', 'FATHER', 'GUARDIAN', 'OTHER');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "preferredCurrency" TEXT NOT NULL DEFAULT 'CLP',
    "locale" TEXT NOT NULL DEFAULT 'es',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "countryId" TEXT,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressRegion" TEXT,
    "addressPostalCode" TEXT,
    "birthDate" TIMESTAMP(3),
    "identifierType" "IdentifierType",
    "identifierValue" TEXT,
    "phone" TEXT,
    "hideBalances" BOOLEAN NOT NULL DEFAULT false,
    "extraCurrencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budgetAlertThreshold" INTEGER DEFAULT 80,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEncrypted" TEXT,
    "mfaFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "mfaLockedUntil" TIMESTAMP(3),
    "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "loginLockedUntil" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "country" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "stepUpAt" TIMESTAMP(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa-recovery-code" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa-recovery-code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency-record" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_FLIGHT',
    "responseBody" JSONB,
    "responseStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency-record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip-geolocation-cache" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip-geolocation-cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange-rate" (
    "id" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "valueDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange-rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank-account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'CHECKING',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "institution" TEXT,
    "institutionId" TEXT,
    "accountNumber" TEXT,
    "accountAlias" TEXT,
    "overdraftLimit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balanceCeiling" DECIMAL(18,4),
    "initialBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "creditUsedInitial" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "creditUsed" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank-account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing-settings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "billingCycleDay" INTEGER,
    "cycleType" "BillingCycleType" NOT NULL DEFAULT 'BUSINESS_DAY',
    "paymentMethod" "BillingPaymentMethod" NOT NULL DEFAULT 'MANUAL',
    "paymentDueDay" INTEGER,
    "paymentDueCycleType" "BillingCycleType" NOT NULL DEFAULT 'BUSINESS_DAY',
    "minimumPaymentPercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing-settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit-statement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "plannedCloseAt" TIMESTAMP(3),
    "amount" DECIMAL(18,4),
    "paidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "carriedOverAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "carriedToId" TEXT,
    "paidFromAccountId" TEXT,
    "paidTransactionId" TEXT,
    "prepaidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "transferredAt" TIMESTAMP(3),
    "transferredAmount" DECIMAL(18,4),
    "transferTransactionId" TEXT,
    "settlementTransactionId" TEXT,
    "transferredToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit-statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card-account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CardKind" NOT NULL,
    "last4" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    "isAdditional" BOOLEAN NOT NULL DEFAULT false,
    "cardholderName" TEXT,
    "network" "CardNetwork",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card-account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card-limit" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "limitAmount" DECIMAL(18,4) NOT NULL,
    "usedInitial" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card-limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet-item-dashboard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "cardId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet-item-dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "cardId" TEXT,
    "financeCharge" BOOLEAN NOT NULL DEFAULT false,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,
    "description" TEXT,
    "observation" TEXT,
    "emisor" TEXT,
    "receptor" TEXT,
    "lugar" TEXT,
    "installmentPlanId" TEXT,
    "savingsEntryId" TEXT,
    "savingsGoalId" TEXT,
    "creditStatementId" TEXT,
    "transferGroupId" TEXT,
    "debtId" TEXT,
    "recurringExpenseId" TEXT,
    "prepaymentStatementId" TEXT,
    "prepaymentAccountId" TEXT,
    "settlesStatementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction-attachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction-attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment-plan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalPrincipal" DECIMAL(18,4) NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "frequency" "InstallmentFrequency" NOT NULL DEFAULT 'MONTHLY',
    "frequencyInterval" INTEGER NOT NULL DEFAULT 1,
    "cardId" TEXT,
    "categoryId" TEXT,
    "paymentAccountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installment-plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment-payment" (
    "id" TEXT NOT NULL,
    "installmentPlanId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(18,4),
    "carriedOverAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "transactionId" TEXT,
    "creditStatementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installment-payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "direction" "DebtDirection" NOT NULL,
    "counterparty" TEXT NOT NULL,
    "principal" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "openedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "interestApr" DECIMAL(8,4),
    "title" TEXT,
    "notes" TEXT,
    "settledAt" TIMESTAMP(3),
    "totalInstallments" INTEGER NOT NULL DEFAULT 1,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "installmentAmount" DECIMAL(18,4),
    "frequency" "InstallmentFrequency" NOT NULL DEFAULT 'MONTHLY',
    "frequencyInterval" INTEGER NOT NULL DEFAULT 1,
    "paymentAccountId" TEXT,
    "lastPaymentTransactionId" TEXT,
    "lastPaymentAccountId" TEXT,
    "lastPaymentAmount" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings-goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetAmount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deadline" TIMESTAMP(3),
    "notes" TEXT,
    "color" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeDestination" "SavingsGoalCloseDestination",
    "closeAccountId" TEXT,
    "closeTransactionId" TEXT,
    "closeAmount" DECIMAL(18,4),
    "closeTargetGoalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings-goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings-entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "savingsGoalId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "contributedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "bankAccountId" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings-entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring-expense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "categoryId" TEXT,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "bankAccountId" TEXT,
    "cardId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring-expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country" (
    "id" TEXT NOT NULL,
    "alpha2" TEXT NOT NULL,
    "alpha3" TEXT NOT NULL,
    "numeric" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "callingCode" TEXT,

    CONSTRAINT "country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "numeric" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country-currency" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "country-currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country-identifier-type" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "identifierType" "IdentifierType" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "country-identifier-type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial-institution" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "kind" "InstitutionKind" NOT NULL DEFAULT 'BANK',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "category" "BankCategory",
    "brands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retailFacing" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial-institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution-account-type" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution-account-type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent-record" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "guardianName" TEXT,
    "guardianIdentifierHash" TEXT,
    "guardianRelationship" "GuardianRelationship",

    CONSTRAINT "consent-record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account-deletion-log" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keepHistory" BOOLEAN NOT NULL,
    "identifierHash" TEXT,

    CONSTRAINT "account-deletion-log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_identifierValue_key" ON "user"("identifierValue");

-- CreateIndex
CREATE INDEX "user_countryId_idx" ON "user"("countryId");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "session_closedAt_idx" ON "session"("closedAt");

-- CreateIndex
CREATE INDEX "mfa-recovery-code_userId_idx" ON "mfa-recovery-code"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "passkey_credentialId_key" ON "passkey"("credentialId");

-- CreateIndex
CREATE INDEX "passkey_userId_idx" ON "passkey"("userId");

-- CreateIndex
CREATE INDEX "idempotency-record_expiresAt_idx" ON "idempotency-record"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency-record_userId_key_key" ON "idempotency-record"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ip-geolocation-cache_ip_key" ON "ip-geolocation-cache"("ip");

-- CreateIndex
CREATE INDEX "ip-geolocation-cache_expiresAt_idx" ON "ip-geolocation-cache"("expiresAt");

-- CreateIndex
CREATE INDEX "exchange-rate_currency_date_idx" ON "exchange-rate"("currency", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "exchange-rate_currency_date_key" ON "exchange-rate"("currency", "date");

-- CreateIndex
CREATE INDEX "bank-account_userId_idx" ON "bank-account"("userId");

-- CreateIndex
CREATE INDEX "bank-account_status_idx" ON "bank-account"("status");

-- CreateIndex
CREATE INDEX "bank-account_institutionId_idx" ON "bank-account"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "billing-settings_accountId_key" ON "billing-settings"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "credit-statement_paidTransactionId_key" ON "credit-statement"("paidTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "credit-statement_transferTransactionId_key" ON "credit-statement"("transferTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "credit-statement_settlementTransactionId_key" ON "credit-statement"("settlementTransactionId");

-- CreateIndex
CREATE INDEX "credit-statement_accountId_idx" ON "credit-statement"("accountId");

-- CreateIndex
CREATE INDEX "credit-statement_accountId_currency_closedAt_idx" ON "credit-statement"("accountId", "currency", "closedAt");

-- CreateIndex
CREATE INDEX "credit-statement_paidFromAccountId_idx" ON "credit-statement"("paidFromAccountId");

-- CreateIndex
CREATE INDEX "card-account_accountId_idx" ON "card-account"("accountId");

-- CreateIndex
CREATE INDEX "card-account_userId_idx" ON "card-account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "card-limit_cardId_currency_key" ON "card-limit"("cardId", "currency");

-- CreateIndex
CREATE INDEX "wallet-item-dashboard_userId_idx" ON "wallet-item-dashboard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet-item-dashboard_userId_accountId_key" ON "wallet-item-dashboard"("userId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet-item-dashboard_userId_cardId_key" ON "wallet-item-dashboard"("userId", "cardId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_savingsEntryId_key" ON "transaction"("savingsEntryId");

-- CreateIndex
CREATE INDEX "transaction_userId_idx" ON "transaction"("userId");

-- CreateIndex
CREATE INDEX "transaction_bankAccountId_idx" ON "transaction"("bankAccountId");

-- CreateIndex
CREATE INDEX "transaction_cardId_idx" ON "transaction"("cardId");

-- CreateIndex
CREATE INDEX "transaction_creditStatementId_idx" ON "transaction"("creditStatementId");

-- CreateIndex
CREATE INDEX "transaction_occurredAt_idx" ON "transaction"("occurredAt");

-- CreateIndex
CREATE INDEX "transaction_installmentPlanId_idx" ON "transaction"("installmentPlanId");

-- CreateIndex
CREATE INDEX "transaction_categoryId_idx" ON "transaction"("categoryId");

-- CreateIndex
CREATE INDEX "transaction_transferGroupId_idx" ON "transaction"("transferGroupId");

-- CreateIndex
CREATE INDEX "transaction_debtId_idx" ON "transaction"("debtId");

-- CreateIndex
CREATE INDEX "transaction_recurringExpenseId_idx" ON "transaction"("recurringExpenseId");

-- CreateIndex
CREATE INDEX "transaction_savingsGoalId_idx" ON "transaction"("savingsGoalId");

-- CreateIndex
CREATE INDEX "transaction_prepaymentStatementId_idx" ON "transaction"("prepaymentStatementId");

-- CreateIndex
CREATE INDEX "transaction_settlesStatementId_idx" ON "transaction"("settlesStatementId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction-attachment_storageKey_key" ON "transaction-attachment"("storageKey");

-- CreateIndex
CREATE INDEX "transaction-attachment_userId_idx" ON "transaction-attachment"("userId");

-- CreateIndex
CREATE INDEX "transaction-attachment_transactionId_idx" ON "transaction-attachment"("transactionId");

-- CreateIndex
CREATE INDEX "installment-plan_userId_idx" ON "installment-plan"("userId");

-- CreateIndex
CREATE INDEX "installment-plan_startDate_idx" ON "installment-plan"("startDate");

-- CreateIndex
CREATE INDEX "installment-plan_cardId_idx" ON "installment-plan"("cardId");

-- CreateIndex
CREATE INDEX "installment-plan_paymentAccountId_idx" ON "installment-plan"("paymentAccountId");

-- CreateIndex
CREATE INDEX "installment-payment_installmentPlanId_idx" ON "installment-payment"("installmentPlanId");

-- CreateIndex
CREATE INDEX "installment-payment_dueDate_idx" ON "installment-payment"("dueDate");

-- CreateIndex
CREATE INDEX "installment-payment_transactionId_idx" ON "installment-payment"("transactionId");

-- CreateIndex
CREATE INDEX "installment-payment_creditStatementId_idx" ON "installment-payment"("creditStatementId");

-- CreateIndex
CREATE UNIQUE INDEX "installment-payment_installmentPlanId_sequence_key" ON "installment-payment"("installmentPlanId", "sequence");

-- CreateIndex
CREATE INDEX "debt_userId_idx" ON "debt"("userId");

-- CreateIndex
CREATE INDEX "debt_openedAt_idx" ON "debt"("openedAt");

-- CreateIndex
CREATE INDEX "debt_dueAt_idx" ON "debt"("dueAt");

-- CreateIndex
CREATE INDEX "debt_paymentAccountId_idx" ON "debt"("paymentAccountId");

-- CreateIndex
CREATE INDEX "savings-goal_userId_idx" ON "savings-goal"("userId");

-- CreateIndex
CREATE INDEX "savings-goal_deadline_idx" ON "savings-goal"("deadline");

-- CreateIndex
CREATE INDEX "savings-entry_userId_idx" ON "savings-entry"("userId");

-- CreateIndex
CREATE INDEX "savings-entry_savingsGoalId_idx" ON "savings-entry"("savingsGoalId");

-- CreateIndex
CREATE INDEX "savings-entry_contributedAt_idx" ON "savings-entry"("contributedAt");

-- CreateIndex
CREATE INDEX "savings-entry_bankAccountId_idx" ON "savings-entry"("bankAccountId");

-- CreateIndex
CREATE INDEX "recurring-expense_userId_idx" ON "recurring-expense"("userId");

-- CreateIndex
CREATE INDEX "recurring-expense_bankAccountId_idx" ON "recurring-expense"("bankAccountId");

-- CreateIndex
CREATE INDEX "recurring-expense_cardId_idx" ON "recurring-expense"("cardId");

-- CreateIndex
CREATE INDEX "recurring-expense_active_idx" ON "recurring-expense"("active");

-- CreateIndex
CREATE UNIQUE INDEX "category_code_key" ON "category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "country_alpha2_key" ON "country"("alpha2");

-- CreateIndex
CREATE UNIQUE INDEX "country_alpha3_key" ON "country"("alpha3");

-- CreateIndex
CREATE UNIQUE INDEX "country_numeric_key" ON "country"("numeric");

-- CreateIndex
CREATE UNIQUE INDEX "currency_code_key" ON "currency"("code");

-- CreateIndex
CREATE INDEX "country-currency_currencyId_idx" ON "country-currency"("currencyId");

-- CreateIndex
CREATE UNIQUE INDEX "country-currency_countryId_currencyId_key" ON "country-currency"("countryId", "currencyId");

-- CreateIndex
CREATE UNIQUE INDEX "country-identifier-type_countryId_identifierType_key" ON "country-identifier-type"("countryId", "identifierType");

-- CreateIndex
CREATE INDEX "financial-institution_countryId_idx" ON "financial-institution"("countryId");

-- CreateIndex
CREATE INDEX "financial-institution_kind_idx" ON "financial-institution"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "financial-institution_countryId_code_key" ON "financial-institution"("countryId", "code");

-- CreateIndex
CREATE INDEX "institution-account-type_institutionId_idx" ON "institution-account-type"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "institution-account-type_institutionId_type_key" ON "institution-account-type"("institutionId", "type");

-- CreateIndex
CREATE INDEX "consent-record_userId_idx" ON "consent-record"("userId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa-recovery-code" ADD CONSTRAINT "mfa-recovery-code_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency-record" ADD CONSTRAINT "idempotency-record_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank-account" ADD CONSTRAINT "bank-account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank-account" ADD CONSTRAINT "bank-account_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "financial-institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing-settings" ADD CONSTRAINT "billing-settings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank-account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit-statement" ADD CONSTRAINT "credit-statement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank-account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit-statement" ADD CONSTRAINT "credit-statement_paidFromAccountId_fkey" FOREIGN KEY ("paidFromAccountId") REFERENCES "bank-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit-statement" ADD CONSTRAINT "credit-statement_paidTransactionId_fkey" FOREIGN KEY ("paidTransactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card-account" ADD CONSTRAINT "card-account_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank-account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card-limit" ADD CONSTRAINT "card-limit_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "card-account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet-item-dashboard" ADD CONSTRAINT "wallet-item-dashboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet-item-dashboard" ADD CONSTRAINT "wallet-item-dashboard_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank-account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet-item-dashboard" ADD CONSTRAINT "wallet-item-dashboard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "card-account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "card-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "installment-plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_savingsEntryId_fkey" FOREIGN KEY ("savingsEntryId") REFERENCES "savings-entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_savingsGoalId_fkey" FOREIGN KEY ("savingsGoalId") REFERENCES "savings-goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring-expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_creditStatementId_fkey" FOREIGN KEY ("creditStatementId") REFERENCES "credit-statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_prepaymentStatementId_fkey" FOREIGN KEY ("prepaymentStatementId") REFERENCES "credit-statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_settlesStatementId_fkey" FOREIGN KEY ("settlesStatementId") REFERENCES "credit-statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction-attachment" ADD CONSTRAINT "transaction-attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction-attachment" ADD CONSTRAINT "transaction-attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment-plan" ADD CONSTRAINT "installment-plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment-plan" ADD CONSTRAINT "installment-plan_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "card-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment-plan" ADD CONSTRAINT "installment-plan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment-plan" ADD CONSTRAINT "installment-plan_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "bank-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment-payment" ADD CONSTRAINT "installment-payment_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "installment-plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment-payment" ADD CONSTRAINT "installment-payment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment-payment" ADD CONSTRAINT "installment-payment_creditStatementId_fkey" FOREIGN KEY ("creditStatementId") REFERENCES "credit-statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt" ADD CONSTRAINT "debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt" ADD CONSTRAINT "debt_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "bank-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings-goal" ADD CONSTRAINT "savings-goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings-entry" ADD CONSTRAINT "savings-entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings-entry" ADD CONSTRAINT "savings-entry_savingsGoalId_fkey" FOREIGN KEY ("savingsGoalId") REFERENCES "savings-goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings-entry" ADD CONSTRAINT "savings-entry_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring-expense" ADD CONSTRAINT "recurring-expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring-expense" ADD CONSTRAINT "recurring-expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring-expense" ADD CONSTRAINT "recurring-expense_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "card-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring-expense" ADD CONSTRAINT "recurring-expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country-currency" ADD CONSTRAINT "country-currency_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country-currency" ADD CONSTRAINT "country-currency_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country-identifier-type" ADD CONSTRAINT "country-identifier-type_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial-institution" ADD CONSTRAINT "financial-institution_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution-account-type" ADD CONSTRAINT "institution-account-type_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "financial-institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent-record" ADD CONSTRAINT "consent-record_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
