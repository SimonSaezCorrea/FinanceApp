import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import { AccountNotFoundError, CardNotFoundError } from "../../../bank-account/domain/errors";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import { InstallmentPlanNotFoundError, InstallmentPlanScheduleLockedError } from "../../domain/errors";
import { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { UpdateInstallmentPlanCommand } from "./update-installment-plan.command";

interface Context {
  plan: InstallmentPlan;
  /** Whether the request touches the schedule itself — decides whether `persist`
   * takes the ordinary scalar-save path or the transactional regenerate one. */
  scheduleChanging: boolean;
  /** The plan's `totalPrincipal` before this update, for the credit-pool delta. */
  oldTotalPrincipal: string;
}

/**
 * Updates a plan — and, when the request touches `totalPrincipal`/
 * `installmentCount`/`startDate`, regenerates its ENTIRE schedule.
 *
 * That's only allowed while nothing on the plan is real history yet: no
 * instalment paid, none billed, and no interest charge from creation (which
 * this domain has no way to recompute against a new total). Past that point
 * `InstallmentPlan.applyUpdate` itself refuses (`INSTALLMENT_PLAN_SCHEDULE_LOCKED`)
 * — the interest check is the one guard that lives here instead, since it needs
 * the `transaction` domain's own movements, which the aggregate has no access to.
 *
 * A CREDIT-card plan's purchase movement (recorded at creation for the OLD
 * total) is kept in step: its amount is corrected and the account's credit pool
 * adjusted by the delta, in the SAME transaction as the schedule replacement —
 * a plan whose total changed with its purchase left behind would understate or
 * overstate the pool with nothing left to detect it.
 */
@Injectable()
@CommandHandler(UpdateInstallmentPlanCommand)
export class UpdateInstallmentPlanHandler extends BaseCommandHandler<
  UpdateInstallmentPlanCommand,
  installments.InstallmentPlan,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateInstallmentPlanCommand): Promise<Context> {
    const plan = await this.repo.findOne(command.userId, command.id);
    if (!plan) throw new InstallmentPlanNotFoundError();

    const { input } = command;
    const scheduleChanging =
      input.totalPrincipal !== undefined ||
      input.installmentCount !== undefined ||
      input.startDate !== undefined;

    // The one guard `InstallmentPlan.applyUpdate` cannot make itself: it has no
    // access to the `transaction` domain, so an interest charge from creation
    // (a finance-charge movement, no card) — which this domain has no formula to
    // recompute against a new total — is refused here instead.
    if (scheduleChanging) {
      const movements = await this.transactions.listForInstallmentPlan(command.userId, plan.id);
      if (movements.some((m) => m.financeCharge)) {
        throw new InstallmentPlanScheduleLockedError(
          input.totalPrincipal !== undefined
            ? "totalPrincipal"
            : input.installmentCount !== undefined
              ? "installmentCount"
              : "startDate",
        );
      }
    }

    return { plan, scheduleChanging, oldTotalPrincipal: plan.totalPrincipal };
  }

  protected async handle(
    command: UpdateInstallmentPlanCommand,
    context: Context,
  ): Promise<HandleResult<installments.InstallmentPlan>> {
    const { input } = command;
    const plan = context.plan;
    // The card AFTER the patch decides it: changing either half — putting the plan on
    // a credit card, or naming an account to pay it from — can break INV-P2, and both
    // arrive in the same request.
    const effectiveCardId = input.cardId !== undefined ? input.cardId : plan.snapshot().cardId;
    const effectivePaymentAccountId =
      input.paymentAccountId !== undefined
        ? input.paymentAccountId
        : plan.snapshot().paymentAccountId;
    const cardKind = effectiveCardId
      ? await this.cards.kindForCard(command.userId, effectiveCardId)
      : null;
    // Same non-conflation rule as create: a card id that resolves to no kind
    // is nonexistent or foreign, never silently treated as "no card".
    if (effectiveCardId && !cardKind) throw new CardNotFoundError();
    if (
      input.paymentAccountId &&
      !(await this.accounts.findById(command.userId, input.paymentAccountId))
    ) {
      throw new AccountNotFoundError();
    }
    InstallmentPlan.assertPaymentAccountAllowed(cardKind, effectivePaymentAccountId);

    plan.applyUpdate({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.frequencyInterval !== undefined
        ? { frequencyInterval: input.frequencyInterval }
        : {}),
      ...(input.cardId !== undefined ? { cardId: input.cardId } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.paymentAccountId !== undefined ? { paymentAccountId: input.paymentAccountId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.totalPrincipal !== undefined ? { totalPrincipal: input.totalPrincipal } : {}),
      ...(input.installmentCount !== undefined ? { installmentCount: input.installmentCount } : {}),
      ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
    });
    return { result: plan.toContract(), events: [] };
  }

  protected override async persist(
    context: Context,
    result: installments.InstallmentPlan,
  ): Promise<void> {
    if (!context.scheduleChanging) {
      await this.repo.save(context.plan);
      return;
    }

    const planned = context.plan.regeneratedSchedule ?? [];
    const newTotalPrincipal = context.plan.totalPrincipal;

    await this.prisma.$transaction(async (tx) => {
      await this.repo.saveScheduleWithTx(tx, context.plan, planned);

      // Only a CREDIT-card plan ever recorded a purchase movement — everyone
      // else's schedule is just a calendar with nothing on the credit pool to
      // correct.
      if (newTotalPrincipal !== context.oldTotalPrincipal) {
        const movements = await this.transactions.listForInstallmentPlan(
          context.plan.userId,
          context.plan.id,
        );
        const purchase = movements.find((m) => !m.financeCharge);
        if (purchase?.bankAccountId) {
          await this.transactions.updateAmountWithTx(tx, purchase.id, newTotalPrincipal);
          const delta = subtractMoney(newTotalPrincipal, context.oldTotalPrincipal);
          await this.accounts.incrementCreditUsedWithTx(tx, purchase.bankAccountId, delta);
        }
      }
    });

    // The aggregate's own payment rows carry placeholder ids past a regeneration
    // (the repository assigns the real ones on insert) — re-read rather than
    // patch them by hand, so every derived figure (remaining, next due, status)
    // comes from the SAME `toContract()` the rest of this domain trusts.
    const refreshed = await this.repo.findOne(context.plan.userId, context.plan.id);
    if (refreshed) Object.assign(result, refreshed.toContract());
  }
}
