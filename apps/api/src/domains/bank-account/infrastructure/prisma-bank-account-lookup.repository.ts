import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { BankAccountLookupPort } from "../domain/ports/bank-account-lookup.port";

/** Adapter for the ownership-lookup slice of the `bank-account` table. */
@Injectable()
export class PrismaBankAccountLookupRepository implements BankAccountLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async accountOwned(userId: string, accountId: string): Promise<boolean> {
    const row = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    return row !== null;
  }
}
