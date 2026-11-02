import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  AccountCreditLimitPlan,
  AccountCreditLimitProps,
} from "../domain/account-credit-limit.entity";
import type { AccountCreditLimitRepositoryPort } from "../domain/ports/account-credit-limit.repository.port";

type Row = {
  id: string;
  currency: string;
  limitAmount: { toString(): string };
  usedInitial: { toString(): string };
};

const toProps = (r: Row): AccountCreditLimitProps => ({
  id: r.id,
  currency: r.currency,
  limitAmount: r.limitAmount.toString(),
  usedInitial: r.usedInitial.toString(),
});

/** Adapter — the ONLY file that touches `prisma.accountCreditLimit`. */
@Injectable()
export class PrismaAccountCreditLimitRepository implements AccountCreditLimitRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByAccounts(
    accountIds: string[],
    tx?: unknown,
  ): Promise<(AccountCreditLimitProps & { accountId: string })[]> {
    if (accountIds.length === 0) return [];
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const rows = await client.accountCreditLimit.findMany({
      where: { accountId: { in: accountIds } },
      orderBy: { currency: "asc" },
    });
    return rows.map((r) => ({ accountId: r.accountId, ...toProps(r) }));
  }

  async findForAccountCurrency(
    userId: string,
    accountId: string,
    currency: string,
    tx?: unknown,
  ): Promise<AccountCreditLimitProps | null> {
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const row = await client.accountCreditLimit.findFirst({
      where: { currency, account: { id: accountId, userId } },
    });
    return row ? toProps(row) : null;
  }

  async createForAccountWithTx(
    tx: unknown,
    accountId: string,
    limits: AccountCreditLimitPlan[],
  ): Promise<void> {
    if (limits.length === 0) return;
    await (tx as PrismaService).accountCreditLimit.createMany({
      data: limits.map((l) => ({ ...l, accountId })),
    });
  }

  async replaceForAccountWithTx(
    tx: unknown,
    accountId: string,
    limits: AccountCreditLimitPlan[],
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.accountCreditLimit.deleteMany({
      where: { accountId, currency: { notIn: limits.map((l) => l.currency) } },
    });
    for (const l of limits) {
      await client.accountCreditLimit.upsert({
        where: { accountId_currency: { accountId, currency: l.currency } },
        create: { ...l, accountId },
        update: { limitAmount: l.limitAmount, usedInitial: l.usedInitial },
      });
    }
  }
}
