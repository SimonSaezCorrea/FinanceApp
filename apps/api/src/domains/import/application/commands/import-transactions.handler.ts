import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { imports } from "@finance/contracts";

import {
  BANK_ACCOUNT_LOOKUP,
  type BankAccountLookupPort,
} from "../../../bank-account/domain/ports/bank-account-lookup.port";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { ImportBatch, type PlannedImportRow } from "../../domain/import-batch";
import {
  IMPORT_TRANSACTIONS_REPOSITORY,
  type ImportTransactionsRepositoryPort,
} from "../../domain/ports/import-transactions.repository.port";
import { ImportTransactionsCommand } from "./import-transactions.command";

interface Context {
  rows: PlannedImportRow[];
}

/** Bulk-imports pre-parsed transaction rows. The repository write happens in
 * `handle()`, so `persist()` stays the default no-op — same shape as
 * `CreateSavingsEntryHandler`. */
@Injectable()
@CommandHandler(ImportTransactionsCommand)
export class ImportTransactionsHandler extends BaseCommandHandler<
  ImportTransactionsCommand,
  imports.ImportResult,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(IMPORT_TRANSACTIONS_REPOSITORY) private readonly repo: ImportTransactionsRepositoryPort,
    @Inject(BANK_ACCOUNT_LOOKUP) private readonly accounts: BankAccountLookupPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: ImportTransactionsCommand): Promise<Context> {
    const rows = ImportBatch.planCreation(command.input);
    // Every referenced account must belong to the caller (Principle II) —
    // checked once per distinct id, not once per row.
    const accountIds = new Set(
      rows.map((r) => r.bankAccountId).filter((id): id is string => id !== null),
    );
    for (const accountId of accountIds) {
      if (!(await this.accounts.accountOwned(command.userId, accountId))) {
        throw new AccountNotFoundError();
      }
    }
    return { rows };
  }

  protected async handle(
    command: ImportTransactionsCommand,
    context: Context,
  ): Promise<HandleResult<imports.ImportResult>> {
    const imported = await this.repo.importRows(command.userId, context.rows);
    return { result: { imported }, events: [] };
  }
}
