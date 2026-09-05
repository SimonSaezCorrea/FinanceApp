import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

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
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import { DebtNotFoundError } from "../../domain/errors";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { UnsettleDebtCommand } from "./unsettle-debt.command";

/**
 * Reverts a settled debt back to open — the aggregate enforces
 * `DEBT_NOT_SETTLED` when it wasn't settled to begin with. Since `settle`
 * (and a `registerPayment` that auto-settles) now records a real payment,
 * reopening a debt reverses it the same way `undoPayment` does: the
 * `Transaction` it created is deleted and the account's balance moved back —
 * a debt reopened but still showing money that already "arrived"/"left"
 * would disagree with itself. A debt settled before that feature existed has
 * nothing recorded to reverse (`Debt.unsettle` returns null then).
 *
 * Read, mutate and write all happen inside one `SELECT ... FOR UPDATE`
 * transaction — see `SettleDebtHandler`'s docstring for why reading outside
 * it (the usual `loadContext` shape) would not actually close the race.
 */
@Injectable()
@CommandHandler(UnsettleDebtCommand)
export class UnsettleDebtHandler extends BaseIdempotentCommandHandler<
  UnsettleDebtCommand,
  debts.Debt,
  null
> {
  protected readonly operation = "debt.unsettle";
  protected override readonly successStatus = 200;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: UnsettleDebtCommand): unknown {
    return { id: command.id };
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handleIdempotent(
    command: UnsettleDebtCommand,
    _context: null,
    complete: CompleteFn<debts.Debt>,
  ): Promise<HandleResult<debts.Debt>> {
    const result = await this.prisma.$transaction(async (tx) => {
      const debt = await this.repo.findOneForUpdateWithTx(tx, command.userId, command.id);
      if (!debt) throw new DebtNotFoundError();
      const direction = debt.direction;
      const reversed = debt.unsettle();
      if (reversed) {
        await this.transactions.deleteWithTx(tx, reversed.transactionId);
        const delta =
          direction === "OWED_TO_YOU" ? subtractMoney("0", reversed.amount) : reversed.amount;
        await this.accounts.incrementBalanceWithTx(tx, reversed.accountId, delta);
      }
      const contract = debt.toContract();
      await this.repo.saveWithTx(tx, debt);
      await complete(tx, contract);
      return contract;
    });
    return { result, events: [] };
  }
}
