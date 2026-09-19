import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import { ListPasskeysQuery } from "./list-passkeys.query";

@Injectable()
@QueryHandler(ListPasskeysQuery)
export class ListPasskeysQueryHandler extends BaseQueryHandler<
  ListPasskeysQuery,
  auth.ListPasskeysResponse,
  null
> {
  constructor(@Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort) {
    super();
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(query: ListPasskeysQuery): Promise<auth.ListPasskeysResponse> {
    const rows = await this.passkeys.findByUserId(query.userId);
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
    }));
  }
}
