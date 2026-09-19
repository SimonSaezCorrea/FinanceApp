import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { ListSessionsQuery } from "./list-sessions.query";

@Injectable()
@QueryHandler(ListSessionsQuery)
export class ListSessionsQueryHandler extends BaseQueryHandler<
  ListSessionsQuery,
  auth.ListSessionsResponse,
  null
> {
  constructor(@Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort) {
    super();
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(query: ListSessionsQuery): Promise<auth.ListSessionsResponse> {
    const now = new Date();
    const rows = await this.sessions.listByUser(query.userId);
    return rows.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      country: s.country,
      city: s.city,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      // A naturally time-expired session reads as closed here even before the daily
      // cron's sweep stamps the row for real — the list must never show a stale
      // session as "active" just because nobody has noticed it expired yet.
      closedAt: s.closedAt ?? (new Date(s.expiresAt) <= now ? s.expiresAt : null),
      isCurrent: s.id === query.currentSessionId,
    }));
  }
}
