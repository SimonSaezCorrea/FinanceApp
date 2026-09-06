import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import { balanceDelta } from "../../domain/balance-delta";
import { TransferPolicy, type TransferAccountContext } from "../../domain/transfer-policy";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { CreateTransferCommand } from "./create-transfer.command";

interface Context {
  from: TransferAccountContext | null;
  to: TransferAccountContext | null;
}

/**
 * Creates a transfer: two ordinary rows sharing a `transferGroupId`, an EXPENSE
 * on the source and an INCOME on the destination, written with both balance
 * moves in one atomic step.
 *
 * Neither leg carries a `cardId` nor a `creditStatementId` (FR-019): moving your
 * own money never draws on a credit pool, so nothing here touches billing.
 */
@Injectable()
@CommandHandler(CreateTransferCommand)
export class CreateTransferHandler extends BaseIdempotentCommandHandler<
  CreateTransferCommand,
  transactions.Transfer,
  Context
> {
  protected readonly operation = "transaction.createTransfer";
  protected override readonly successStatus = 201;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: CreateTransferCommand): unknown {
    return command.input;
  }

  protected async loadContext(command: CreateTransferCommand): Promise<Context> {
    return loadTransferAccounts(
      this.accounts,
      command.userId,
      command.input.fromBankAccountId,
      command.input.toBankAccountId,
    );
  }

  protected async handleIdempotent(
    command: CreateTransferCommand,
    context: Context,
    complete: CompleteFn<transactions.Transfer>,
  ): Promise<HandleResult<transactions.Transfer>> {
    const { input, userId } = command;
    TransferPolicy.validate(input, context.from, context.to);

    const transferGroupId = generateRowId();
    const occurredAt = new Date(input.occurredAt);
    const shared = {
      userId,
      occurredAt,
      category: input.category ?? null,
      description: input.description ?? null,
      observation: input.observation ?? null,
      emisor: input.emisor ?? null,
      receptor: input.receptor ?? null,
      lugar: input.lugar ?? null,
      cardId: null,
      financeCharge: false,
      installmentPlanId: null,
      creditStatementId: null,
      transferGroupId,
      debtId: null,
      recurringExpenseId: null,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      const pair = await this.repo.saveTransferPairWithTx(
        tx,
        userId,
        {
          ...shared,
          type: "EXPENSE",
          amount: input.amountOut,
          currency: input.currencyOut,
          bankAccountId: input.fromBankAccountId,
        },
        {
          ...shared,
          type: "INCOME",
          amount: input.amountIn,
          currency: input.currencyIn,
          bankAccountId: input.toBankAccountId,
        },
        [
          { accountId: input.fromBankAccountId, delta: balanceDelta("EXPENSE", input.amountOut) },
          { accountId: input.toBankAccountId, delta: balanceDelta("INCOME", input.amountIn) },
        ],
      );
      const contract = toTransferContract(pair);
      await complete(tx, contract);
      return contract;
    });

    return { result, events: [] };
  }
}

/** Shared by the create/update handlers — each account read through its own port. */
export async function loadTransferAccounts(
  accounts: BankAccountRepositoryPort,
  userId: string,
  fromId: string | undefined,
  toId: string | undefined,
): Promise<{ from: TransferAccountContext | null; to: TransferAccountContext | null }> {
  const load = async (id: string | undefined) => {
    if (!id) return null;
    const account = await accounts.findById(userId, id);
    if (!account) return null;
    const snap = account.snapshot();
    // `currentBalance` is what bounds a PREPAID source's outgoing leg.
    return { id: snap.id, type: snap.type, currentBalance: account.currentBalance };
  };
  return { from: await load(fromId), to: await load(toId) };
}

export function toTransferContract(pair: {
  transferGroupId: string;
  outgoing: { toContract: () => transactions.Transaction };
  incoming: { toContract: () => transactions.Transaction };
}): transactions.Transfer {
  return {
    transferGroupId: pair.transferGroupId,
    outgoing: pair.outgoing.toContract(),
    incoming: pair.incoming.toContract(),
  };
}
