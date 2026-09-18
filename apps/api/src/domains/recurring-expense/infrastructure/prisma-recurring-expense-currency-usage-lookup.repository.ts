import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CurrencyUsageLookupPort } from "../domain/ports/currency-usage-lookup.port";

/** Adapter for the currency-usage-lookup slice of the `recurring-expense` table. */
@Injectable()
export class PrismaRecurringExpenseCurrencyUsageLookupRepository implements CurrencyUsageLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async isCurrencyInUse(userId: string, currency: string): Promise<boolean> {
    const row = await this.prisma.recurringExpense.findFirst({
      where: { userId, currency },
      select: { id: true },
    });
    return row !== null;
  }
}
