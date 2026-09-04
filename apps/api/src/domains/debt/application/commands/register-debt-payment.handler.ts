import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";

import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import { DebtNotFoundError } from "../../domain/errors";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { RegisterDebtPaymentCommand } from "./register-debt-payment.command";

/**
 * Registers one more paid installment — the aggregate enforces
 * `DEBT_ALREADY_SETTLED`/`ALL_INSTALLMENTS_PAID` and auto-settles once the
 * schedule completes.
 *
 * `paidInstallments += 1` is exactly the kind of write Constitution Principle
 * VII names as never idempotent on its own — the reservation protects a
 * RETRY of the same attempt. A genuinely concurrent second click is a
 * DIFFERENT hazard (a lost update, two reads racing one write), closed here
 * by reading the row `FOR UPDATE` inside the same transaction that mutates
 * and saves it, rather than in `loadContext` outside any transaction.
 */
@Injectable()
@CommandHandler(RegisterDebtPaymentCommand)
export class RegisterDebtPaymentHandler extends BaseIdempotentCommandHandler<
  RegisterDebtPaymentCommand,
  debts.Debt,
  null
> {
  protected readonly operation = "debt.registerPayment";
  protected override readonly successStatus = 200;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: RegisterDebtPaymentCommand): unknown {
    return { id: command.id };
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handleIdempotent(
    command: RegisterDebtPaymentCommand,
    _context: null,
    complete: CompleteFn<debts.Debt>,
  ): Promise<HandleResult<debts.Debt>> {
    const result = await this.prisma.$transaction(async (tx) => {
      const debt = await this.repo.findOneForUpdateWithTx(tx, command.userId, command.id);
      if (!debt) throw new DebtNotFoundError();
      debt.registerPayment();
      const contract = debt.toContract();
      await this.repo.saveWithTx(tx, debt);
      await complete(tx, contract);
      return contract;
    });
    return { result, events: [] };
  }
}
