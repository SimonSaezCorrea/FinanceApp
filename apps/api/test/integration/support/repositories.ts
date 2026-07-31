import { PrismaBankAccountRepository } from "../../../src/domains/bank-account/infrastructure/prisma-bank-account.repository";
import { PrismaBillingSettingsRepository } from "../../../src/domains/billing-settings/infrastructure/prisma-billing-settings.repository";
import { PrismaCardAccountRepository } from "../../../src/domains/card-account/infrastructure/prisma-card-account.repository";
import { PrismaCardLimitRepository } from "../../../src/domains/card-limit/infrastructure/prisma-card-limit.repository";
import { PrismaInstallmentPaymentRepository } from "../../../src/domains/installment-payment/infrastructure/prisma-installment-payment.repository";
import { PrismaInstallmentPlanRepository } from "../../../src/domains/installment-plan/infrastructure/prisma-installment-plan.repository";
import { PrismaCreditStatementRepository } from "../../../src/domains/credit-statement/infrastructure/prisma-credit-statement.repository";
import { PrismaFinancialInstitutionLookupRepository } from "../../../src/domains/financial-institution/infrastructure/prisma-financial-institution-lookup.repository";
import { PrismaTransactionSumsRepository } from "../../../src/domains/transaction/infrastructure/prisma-transaction-sums.repository";
import { PrismaTransactionWriterRepository } from "../../../src/domains/transaction/infrastructure/prisma-transaction-writer.repository";
import { PrismaCountryIdentifierTypeRepository } from "../../../src/domains/country-identifier-type/infrastructure/prisma-country-identifier-type.repository";
import { PrismaCountryRepository } from "../../../src/domains/country/infrastructure/prisma-country.repository";
import { PrismaCountryLookupRepository } from "../../../src/domains/country/infrastructure/prisma-country-lookup.repository";
import { PrismaUserRepository } from "../../../src/domains/user/infrastructure/prisma-user.repository";
import { PrismaWalletItemRepository } from "../../../src/domains/wallet-item-dashboard/infrastructure/prisma-wallet-item.repository";
import type { PrismaService } from "../../../src/infra/prisma/prisma.service";

/**
 * Composition helpers for the integration tier. Since each table owns its own
 * adapter, a `BankAccount` repository is now a small graph of them (cards →
 * limits, billing settings, institution lookup) — wiring it by hand in every
 * spec would be noise, and Nest's DI does exactly this in production.
 */
export function buildBankAccountRepo(prisma: PrismaService): PrismaBankAccountRepository {
  const cards = new PrismaCardAccountRepository(prisma, new PrismaCardLimitRepository(prisma));
  return new PrismaBankAccountRepository(
    prisma,
    cards,
    new PrismaBillingSettingsRepository(prisma),
    new PrismaFinancialInstitutionLookupRepository(prisma),
  );
}

export function buildCreditStatementRepo(prisma: PrismaService): PrismaCreditStatementRepository {
  return new PrismaCreditStatementRepository(prisma, new PrismaTransactionSumsRepository(prisma));
}

export function buildTransactionSumsRepo(prisma: PrismaService): PrismaTransactionSumsRepository {
  return new PrismaTransactionSumsRepository(prisma);
}

export function buildTransactionWriterRepo(
  prisma: PrismaService,
): PrismaTransactionWriterRepository {
  return new PrismaTransactionWriterRepository(prisma);
}

export function buildInstallmentPlanRepo(prisma: PrismaService): PrismaInstallmentPlanRepository {
  return new PrismaInstallmentPlanRepository(
    prisma,
    new PrismaInstallmentPaymentRepository(prisma),
  );
}

export function buildUserRepo(prisma: PrismaService): PrismaUserRepository {
  return new PrismaUserRepository(prisma, new PrismaCountryLookupRepository(prisma));
}

export function buildWalletItemRepo(prisma: PrismaService): PrismaWalletItemRepository {
  const cards = new PrismaCardAccountRepository(prisma, new PrismaCardLimitRepository(prisma));
  return new PrismaWalletItemRepository(prisma, buildBankAccountRepo(prisma), cards);
}

export function buildCountryRepo(prisma: PrismaService): PrismaCountryRepository {
  return new PrismaCountryRepository(prisma, new PrismaCountryIdentifierTypeRepository(prisma));
}
