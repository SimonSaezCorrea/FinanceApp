import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";
import { sumMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import { balanceDelta, reverseBalanceDelta } from "../../domain/balance-delta";
import { TransferNotFoundError } from "../../domain/errors";
import { TransferPolicy, type TransferAccountContext } from "../../domain/transfer-policy";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
  type TransferPair,
} from "../../domain/ports/transaction.repository.port";
import { loadTransferAccounts, toTransferContract } from "./create-transfer.handler";
import { UpdateTransferCommand } from "./update-transfer.command";

interface Context {
  existing: TransferPair;
  from: TransferAccountContext | null;
  to: TransferAccountContext | null;
  fromId: string;
  toId: string;
}

/**
 * Edits a transfer as a unit. Either account may change, so up to THREE
 * balances move: the old side is reverted and the new one applied, netted per
 * account so an unchanged account gets a single (possibly zero) delta.
 */
@Injectable()
@CommandHandler(UpdateTransferCommand)
export class UpdateTransferHandler extends BaseCommandHandler<
  UpdateTransferCommand,
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

  protected async loadContext(command: UpdateTransferCommand): Promise<Context> {
    const existing = await this.repo.findTransferGroup(command.userId, command.transferGroupId);
    if (!existing) throw new TransferNotFoundError();

    const fromId = command.input.fromBankAccountId ?? existing.outgoing.bankAccountId!;
    const toId = command.input.toBankAccountId ?? existing.incoming.bankAccountId!;
    const { from, to } = await loadTransferAccounts(this.accounts, command.userId, fromId, toId);
    return { existing, from, to, fromId, toId };
  }

  protected async handle(
    command: UpdateTransferCommand,
    context: Context,
  ): Promise<HandleResult<transactions.Transfer>> {
    const { input, userId } = command;
    const { existing, fromId, toId } = context;

    const amountOut = input.amountOut ?? existing.outgoing.amount;
    const amountIn = input.amountIn ?? existing.incoming.amount;

    TransferPolicy.validate(
      { fromBankAccountId: fromId, toBankAccountId: toId, amountOut, amountIn },
      context.from,
      context.to,
    );

    const shared = {
      ...(input.occurredAt !== undefined ? { occurredAt: new Date(input.occurredAt) } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.observation !== undefined ? { observation: input.observation } : {}),
      ...(input.emisor !== undefined ? { emisor: input.emisor } : {}),
      ...(input.receptor !== undefined ? { receptor: input.receptor } : {}),
      ...(input.lugar !== undefined ? { lugar: input.lugar } : {}),
    };

    // Revert what the old pair did, then apply the new one — netted per account
    // so an account that appears on both sides gets one delta, not two.
    const deltas = netDeltas([
      {
        accountId: existing.outgoing.bankAccountId!,
        delta: reverseBalanceDelta("EXPENSE", existing.outgoing.amount),
      },
      {
        accountId: existing.incoming.bankAccountId!,
        delta: reverseBalanceDelta("INCOME", existing.incoming.amount),
      },
      { accountId: fromId, delta: balanceDelta("EXPENSE", amountOut) },
      { accountId: toId, delta: balanceDelta("INCOME", amountIn) },
    ]);

    const pair = await this.repo.updateTransferPair(
      userId,
      command.transferGroupId,
      {
        ...shared,
        amount: amountOut,
        ...(input.currencyOut !== undefined ? { currency: input.currencyOut } : {}),
        bankAccountId: fromId,
      },
      {
        ...shared,
        amount: amountIn,
        ...(input.currencyIn !== undefined ? { currency: input.currencyIn } : {}),
        bankAccountId: toId,
      },
      deltas,
    );
    if (!pair) throw new TransferNotFoundError();

    return { result: toTransferContract(pair), events: [] };
  }
}

/** Collapses several deltas on the same account into one. */
export function netDeltas(
  deltas: { accountId: string; delta: string }[],
): { accountId: string; delta: string }[] {
  const byAccount = new Map<string, string[]>();
  for (const d of deltas) {
    byAccount.set(d.accountId, [...(byAccount.get(d.accountId) ?? []), d.delta]);
  }
  return [...byAccount.entries()].map(([accountId, values]) => ({
    accountId,
    delta: sumMoney(values),
  }));
}
