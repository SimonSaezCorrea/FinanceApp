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
import { UndoDebtPaymentCommand } from "./undo-debt-payment.command";

/** Reverts the most recently registered payment — `NO_PAYMENTS_TO_UNDO` if
 * none were registered; clears `settledAt` only if the undone payment is the
 * one that had auto-settled it (see `Debt.undoPayment`). Same `-= 1` hazard
 * as the register path, closed the same way: the row is read `FOR UPDATE`
 * inside the transaction that mutates and saves it. */
@Injectable()
@CommandHandler(UndoDebtPaymentCommand)
export class UndoDebtPaymentHandler extends BaseIdempotentCommandHandler<
  UndoDebtPaymentCommand,
  debts.Debt,
  null
> {
  protected readonly operation = "debt.undoPayment";
  protected override readonly successStatus = 200;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: UndoDebtPaymentCommand): unknown {
    return { id: command.id };
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handleIdempotent(
    command: UndoDebtPaymentCommand,
    _context: null,
    complete: CompleteFn<debts.Debt>,
  ): Promise<HandleResult<debts.Debt>> {
    const result = await this.prisma.$transaction(async (tx) => {
      const debt = await this.repo.findOneForUpdateWithTx(tx, command.userId, command.id);
      if (!debt) throw new DebtNotFoundError();
      debt.undoPayment();
      const contract = debt.toContract();
      await this.repo.saveWithTx(tx, debt);
      await complete(tx, contract);
      return contract;
    });
    return { result, events: [] };
  }
}
