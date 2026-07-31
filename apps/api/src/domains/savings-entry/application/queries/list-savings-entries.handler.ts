import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../domain/ports/savings-entry.repository.port";
import { ListSavingsEntriesQuery } from "./list-savings-entries.query";

@Injectable()
@QueryHandler(ListSavingsEntriesQuery)
export class ListSavingsEntriesQueryHandler extends BaseQueryHandler<
  ListSavingsEntriesQuery,
  savings.SavingsEntry[],
  string
> {
  constructor(@Inject(SAVINGS_ENTRY_REPOSITORY) private readonly repo: SavingsEntryRepositoryPort) {
    super();
  }

  protected async loadContext(query: ListSavingsEntriesQuery): Promise<string> {
    return query.userId;
  }

  protected async handle(
    _query: ListSavingsEntriesQuery,
    userId: string,
  ): Promise<savings.SavingsEntry[]> {
    const rows = await this.repo.list(userId);
    return rows.map((r) => r.toContract());
  }
}
