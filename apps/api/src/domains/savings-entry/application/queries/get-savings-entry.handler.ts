import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { SavingsEntryNotFoundError } from "../../domain/errors";
import type { SavingsEntry } from "../../domain/savings-entry.aggregate";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../domain/ports/savings-entry.repository.port";
import { GetSavingsEntryQuery } from "./get-savings-entry.query";

@Injectable()
@QueryHandler(GetSavingsEntryQuery)
export class GetSavingsEntryQueryHandler extends BaseQueryHandler<
  GetSavingsEntryQuery,
  savings.SavingsEntry,
  SavingsEntry
> {
  constructor(@Inject(SAVINGS_ENTRY_REPOSITORY) private readonly repo: SavingsEntryRepositoryPort) {
    super();
  }

  protected async loadContext(query: GetSavingsEntryQuery): Promise<SavingsEntry> {
    const row = await this.repo.findOne(query.userId, query.id);
    if (!row) throw new SavingsEntryNotFoundError();
    return row;
  }

  protected async handle(
    _query: GetSavingsEntryQuery,
    row: SavingsEntry,
  ): Promise<savings.SavingsEntry> {
    return row.toContract();
  }
}
