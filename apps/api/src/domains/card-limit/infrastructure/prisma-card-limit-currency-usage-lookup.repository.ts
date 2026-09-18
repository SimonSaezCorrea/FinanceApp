import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CurrencyUsageLookupPort } from "../domain/ports/currency-usage-lookup.port";

/**
 * Adapter for the currency-usage-lookup slice of the `card-limit` table.
 * `CardLimit` carries no `userId` of its own — scoped through its owning
 * `CardAccount.userId`, the same join `PrismaCardLimitRepository.findForCardCurrency`
 * already uses.
 */
@Injectable()
export class PrismaCardLimitCurrencyUsageLookupRepository implements CurrencyUsageLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async isCurrencyInUse(userId: string, currency: string): Promise<boolean> {
    const row = await this.prisma.cardLimit.findFirst({
      where: { currency, card: { userId } },
      select: { id: true },
    });
    return row !== null;
  }
}
