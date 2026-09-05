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
import { UndoDebtPaymentCommand } from "./undo-debt-payment.command";

/** Reverts the most recently registered payment — `NO_PAYMENTS_TO_UNDO` if
 * none were registered; clears `settledAt` only if the undone payment is the
 * one that had auto-settled it (see `Debt.undoPayment`). When that payment
 * moved real money (every one registered since register-payment started
 * doing that), the movement is reversed too: its `Transaction` row deleted
 * and the account's balance moved back by the same amount, opposite
 * direction. A debt paid before that feature existed has nothing recorded to
 * reverse (`Debt.undoPayment` returns null then) — only the counter moves,
 * same as before. Same `-= 1` hazard as the register path, closed the same
 * way: the row is read `FOR UPDATE` inside the transaction that mutates and
 * saves it. */
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
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
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
      const direction = debt.direction;
      const reversed = debt.undoPayment();
      if (reversed) {
        await this.transactions.deleteWithTx(tx, reversed.transactionId);
        // OWED_TO_YOU's payment was an INCOME (money came in) — reversing it
        // takes that back out; YOU_OWE's was an EXPENSE — reversing restores it.
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
