import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
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
export class CreateTransferHandler extends BaseCommandHandler<
  CreateTransferCommand,
  transactions.Transfer,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateTransferCommand): Promise<Context> {
    return loadTransferAccounts(
      this.accounts,
      command.userId,
      command.input.fromBankAccountId,
      command.input.toBankAccountId,
    );
  }

  protected async handle(
    command: CreateTransferCommand,
    context: Context,
  ): Promise<HandleResult<transactions.Transfer>> {
    const { input, userId } = command;
    TransferPolicy.validate(input, context.from, context.to);

    const transferGroupId = randomUUID();
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
    };

    const pair = await this.repo.saveTransferPair(
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

    return { result: toTransferContract(pair), events: [] };
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
