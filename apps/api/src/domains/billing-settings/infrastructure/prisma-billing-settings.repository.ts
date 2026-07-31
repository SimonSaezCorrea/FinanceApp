import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { BillingSettingsProps } from "../domain/billing-settings.entity";
import type { BillingSettingsRepositoryPort } from "../domain/ports/billing-settings.repository.port";

type Row = { billingCycleDay: number | null; paymentMethod: "MANUAL" | "AUTOMATIC"; paymentDueDay: number | null };

const toProps = (row: Row): BillingSettingsProps => ({
  billingCycleDay: row.billingCycleDay,
  paymentMethod: row.paymentMethod,
  paymentDueDay: row.paymentDueDay,
});

/** Adapter — the ONLY file that touches `prisma.billingSettings`. */
@Injectable()
export class PrismaBillingSettingsRepository implements BillingSettingsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByAccount(accountId: string): Promise<BillingSettingsProps | null> {
    const row = await this.prisma.billingSettings.findUnique({ where: { accountId } });
    return row ? toProps(row) : null;
  }

  async listByAccounts(accountIds: string[]): Promise<(BillingSettingsProps & { accountId: string })[]> {
    if (accountIds.length === 0) return [];
    const rows = await this.prisma.billingSettings.findMany({ where: { accountId: { in: accountIds } } });
    return rows.map((r) => ({ accountId: r.accountId, ...toProps(r) }));
  }

  async accountIdsWithCycleDay(): Promise<string[]> {
    const rows = await this.prisma.billingSettings.findMany({
      where: { billingCycleDay: { not: null } },
      select: { accountId: true },
    });
    return rows.map((r) => r.accountId);
  }

  async upsert(accountId: string, settings: Partial<BillingSettingsProps>): Promise<void> {
    await this.upsertWithTx(this.prisma, accountId, settings);
  }

  async upsertWithTx(tx: unknown, accountId: string, settings: Partial<BillingSettingsProps>): Promise<void> {
    const client = tx as PrismaService;
    await client.billingSettings.upsert({
      where: { accountId },
      create: {
        accountId,
        billingCycleDay: settings.billingCycleDay ?? null,
        paymentMethod: settings.paymentMethod ?? "MANUAL",
        paymentDueDay: settings.paymentDueDay ?? null,
      },
      update: {
        ...(settings.billingCycleDay !== undefined ? { billingCycleDay: settings.billingCycleDay } : {}),
        ...(settings.paymentMethod !== undefined ? { paymentMethod: settings.paymentMethod } : {}),
        ...(settings.paymentDueDay !== undefined ? { paymentDueDay: settings.paymentDueDay } : {}),
      },
    });
  }
}
