import { Injectable, NotFoundException } from "@nestjs/common";
import type { BankAccount, CardAccount } from "@prisma/client";

import { nextBoundaryAfter } from "./billing-cycle";
import { AccountsRepository } from "./accounts.repository";

type AccountWithCards = BankAccount & {
  cards: CardAccount[];
  billingSettings: { billingCycleDay: number | null } | null;
};

/**
 * Closes an account's currently OPEN `CreditStatement` once its `billingCycleDay`
 * boundary has passed — shared by the manual "Generar facturación" button
 * (`generateForAccount`) and the daily cron (`generateForAllDueAccounts`, see
 * `src/infra/cron`). Never creates a statement itself (that happens lazily, in
 * `TransactionsService`, the moment a contributing movement occurs) — it only seals
 * one that already exists and is due.
 */
@Injectable()
export class BillingGenerationService {
  constructor(private readonly repo: AccountsRepository) {}

  /** Manual trigger, scoped to one user's account. Returns whether it closed one. */
  async generateForAccount(userId: string, accountId: string): Promise<boolean> {
    const account = await this.repo.findOne(userId, accountId);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    return this.closeIfDue(account);
  }

  /** Cron trigger — every account (any user) with a billing day configured. */
  async generateForAllDueAccounts(): Promise<void> {
    const accounts = await this.repo.listAccountsWithBillingCycle();
    for (const account of accounts) {
      await this.closeIfDue(account);
    }
  }

  private async closeIfDue(account: AccountWithCards): Promise<boolean> {
    const day = account.billingSettings?.billingCycleDay;
    if (!day) return false;

    // No usage since the last close → no statement was ever opened → nothing to
    // generate ("si la tarjeta no tuvo uso, no se genera facturación").
    const open = await this.repo.findOpenStatement(account.id);
    if (!open) return false;

    const boundary = nextBoundaryAfter(open.periodStart, day);
    if (new Date() < boundary) return false;

    // Inactive account/card: leave it accumulating, don't seal it this cycle
    // ("se dejan de generar si la cuenta o la tarjeta está inactiva").
    if (!this.isEligible(account)) return false;

    await this.repo.closeStatement(open.id, boundary);
    return true;
  }

  private isEligible(account: AccountWithCards): boolean {
    if (account.status !== "ACTIVE") return false;
    if (account.type === "CREDIT_LINE") {
      return account.cards.some((c) => c.kind === "CREDIT" && c.isPrimary && c.isActive);
    }
    return account.cards.some((c) => c.kind === "CREDIT" && c.isActive);
  }
}
