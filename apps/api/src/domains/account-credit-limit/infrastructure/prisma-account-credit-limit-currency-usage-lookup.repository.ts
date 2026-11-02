import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CurrencyUsageLookupPort } from "../domain/ports/currency-usage-lookup.port";

/** Adapter for the currency-usage slice of the `account-credit-limit` table, scoped through
 * its owning `BankAccount.userId`. */
@Injectable()
export class PrismaAccountCreditLimitCurrencyUsageLookupRepository implements CurrencyUsageLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async isCurrencyInUse(userId: string, currency: string): Promise<boolean> {
    const row = await this.prisma.accountCreditLimit.findFirst({
      where: { currency, account: { userId } },
      select: { id: true },
    });
    return row !== null;
  }
}
