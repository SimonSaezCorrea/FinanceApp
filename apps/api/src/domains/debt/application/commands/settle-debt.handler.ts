import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

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
import { SettleDebtCommand } from "./settle-debt.command";

/**
 * Marks a debt settled — the aggregate enforces `DEBT_ALREADY_SETTLED` when it
 * already was, rather than silently re-stamping `settledAt` (fixed alongside
 * this feature; see `Debt.settle`).
 *
 * The read, the mutation and the write all happen INSIDE one transaction, via
 * a `SELECT ... FOR UPDATE` (`findOneForUpdateWithTx`) — not just the write.
 * Reading in `loadContext` (outside any transaction, the usual shape) and
 * writing in `persist()` looks equivalent and is not: two concurrent settles
 * would both read "not settled" before either commits. The idempotency
 * record's COMPLETED mark commits in the same transaction too, so a retry and
 * a genuine concurrent settle are both handled by the one lock.
 */
@Injectable()
@CommandHandler(SettleDebtCommand)
export class SettleDebtHandler extends BaseIdempotentCommandHandler<SettleDebtCommand, void, null> {
  protected readonly operation = "debt.settle";
  protected override readonly successStatus = 204;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: SettleDebtCommand): unknown {
    return { id: command.id };
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handleIdempotent(
    command: SettleDebtCommand,
    _context: null,
    complete: CompleteFn<void>,
  ): Promise<HandleResult<void>> {
    await this.prisma.$transaction(async (tx) => {
      const debt = await this.repo.findOneForUpdateWithTx(tx, command.userId, command.id);
      if (!debt) throw new DebtNotFoundError();
      debt.settle();
      await this.repo.saveWithTx(tx, debt);
      await complete(tx, undefined);
    });
    return { result: undefined, events: [] };
  }
}
