import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CONSENT_RECORD_REPOSITORY,
  type ConsentRecordRepositoryPort,
} from "../../../consent-record/domain/ports/consent-record.repository.port";
import { ListConsentsQuery } from "./list-consents.query";

@Injectable()
@QueryHandler(ListConsentsQuery)
export class ListConsentsQueryHandler extends BaseQueryHandler<
  ListConsentsQuery,
  auth.ListConsentsResponse,
  null
> {
  constructor(
    @Inject(CONSENT_RECORD_REPOSITORY) private readonly consents: ConsentRecordRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(query: ListConsentsQuery): Promise<auth.ListConsentsResponse> {
    const rows = await this.consents.listByUser(query.userId);
    return rows.map((c) => ({
      id: c.id,
      type: c.type,
      policyVersion: c.policyVersion,
      grantedAt: c.grantedAt,
      revokedAt: c.revokedAt,
      guardianName: c.guardianName,
      guardianRelationship: c.guardianRelationship,
    }));
  }
}
