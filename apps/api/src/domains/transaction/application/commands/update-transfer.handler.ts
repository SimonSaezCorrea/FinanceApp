import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";
import { sumMoney } from "@finance/money";

import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../../category/domain/ports/category-lookup.port";
import { assertSelectableCategory } from "../../../category/domain/category-policy";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../../credit-statement/domain/ports/credit-statement.repository.port";
import {
  reverseTransferLegDelta,
  transferLegDelta,
  type LegDelta,
} from "../../domain/balance-delta";
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
  /** The accounts the pair sits on BEFORE the edit — what gets reverted. */
  oldFrom: TransferAccountContext | null;
  oldTo: TransferAccountContext | null;
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
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookupPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statements: CreditStatementRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateTransferCommand): Promise<Context> {
    const existing = await this.repo.findTransferGroup(command.userId, command.transferGroupId);
    if (!existing) throw new TransferNotFoundError();
    const { categoryId } = command.input;
    if (categoryId !== undefined && categoryId !== existing.outgoing.snapshot().categoryId) {
      await assertSelectableCategory(this.categories, categoryId);
    }

    const fromId = command.input.fromBankAccountId ?? existing.outgoing.bankAccountId!;
    const toId = command.input.toBankAccountId ?? existing.incoming.bankAccountId!;
    const { from, to } = await loadTransferAccounts(this.accounts, command.userId, fromId, toId);
    const old = await loadTransferAccounts(
      this.accounts,
      command.userId,
      existing.outgoing.bankAccountId ?? undefined,
      existing.incoming.bankAccountId ?? undefined,
    );
    return { existing, from, to, oldFrom: old.from, oldTo: old.to, fromId, toId };
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
      // Editing a transfer that already left this same account is checked against
      // the balance BEFORE its own outgoing leg — otherwise raising it at all would
      // look like it doesn't fit.
      existing.outgoing.bankAccountId === fromId ? existing.outgoing.amount : "0",
    );

    const shared = {
      ...(input.occurredAt !== undefined ? { occurredAt: new Date(input.occurredAt) } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.observation !== undefined ? { observation: input.observation } : {}),
      ...(input.emisor !== undefined ? { emisor: input.emisor } : {}),
      ...(input.receptor !== undefined ? { receptor: input.receptor } : {}),
      ...(input.lugar !== undefined ? { lugar: input.lugar } : {}),
    };

    // Revert what the old pair did, then apply the new one — netted per account
    // so an account that appears on both sides gets one delta, not two.
    const deltas = netDeltas([
      ...(context.oldFrom
        ? [reverseTransferLegDelta("EXPENSE", existing.outgoing.amount, context.oldFrom)]
        : []),
      ...(context.oldTo
        ? [reverseTransferLegDelta("INCOME", existing.incoming.amount, context.oldTo)]
        : []),
      transferLegDelta("EXPENSE", amountOut, context.from!),
      transferLegDelta("INCOME", amountIn, context.to!),
    ]);

    // A leg that stays on the same credit card account keeps its period; one that
    // moves onto one joins that account's open period; any other carries none.
    const statementFor = async (
      account: TransferAccountContext,
      leg: TransferPair["outgoing"],
    ): Promise<string | null> => {
      if (account.type !== "CREDIT_CARD") return null;
      if (leg.bankAccountId === account.id && leg.creditStatementId) return leg.creditStatementId;
      const period = await this.statements.findOrCreateOpenForAccount(
        account.id,
        account.createdAt ?? new Date(),
        account.currency ?? "CLP",
      );
      return period.id;
    };
    const outStatement = await statementFor(context.from!, existing.outgoing);
    const inStatement = await statementFor(context.to!, existing.incoming);

    const pair = await this.repo.updateTransferPair(
      userId,
      command.transferGroupId,
      {
        ...shared,
        amount: amountOut,
        ...(input.currencyOut !== undefined ? { currency: input.currencyOut } : {}),
        bankAccountId: fromId,
        creditStatementId: outStatement,
      },
      {
        ...shared,
        amount: amountIn,
        ...(input.currencyIn !== undefined ? { currency: input.currencyIn } : {}),
        bankAccountId: toId,
        creditStatementId: inStatement,
      },
      deltas,
    );
    if (!pair) throw new TransferNotFoundError();

    return { result: toTransferContract(pair), events: [] };
  }
}

/** Collapses several deltas on the same account (and the same target: cash or
 * credit pool) into one. */
export function netDeltas(deltas: LegDelta[]): LegDelta[] {
  const byKey = new Map<string, { accountId: string; pool: boolean; values: string[] }>();
  for (const d of deltas) {
    const key = `${d.accountId}|${d.pool ? 1 : 0}`;
    const entry = byKey.get(key) ?? { accountId: d.accountId, pool: Boolean(d.pool), values: [] };
    entry.values.push(d.delta);
    byKey.set(key, entry);
  }
  return [...byKey.values()].map(({ accountId, pool, values }) => ({
    accountId,
    delta: sumMoney(values),
    ...(pool ? { pool } : {}),
  }));
}
