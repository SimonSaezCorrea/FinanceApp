import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  USER_EMAIL_REPOSITORY,
  type UserEmailRepositoryPort,
} from "../../../user-email/domain/ports/user-email.repository.port";
import { sortForDisplay, type UserEmailProps } from "../../../user-email/domain/user-email.entity";
import { userEmailToContract } from "../user-email.mapper";
import { ListUserEmailsQuery } from "./list-user-emails.query";

/** The account's email list (specs/032 FR-012b): primary, pending, then history. */
@Injectable()
@QueryHandler(ListUserEmailsQuery)
export class ListUserEmailsQueryHandler extends BaseQueryHandler<
  ListUserEmailsQuery,
  auth.ListUserEmailsResponse,
  UserEmailProps[]
> {
  constructor(@Inject(USER_EMAIL_REPOSITORY) private readonly emails: UserEmailRepositoryPort) {
    super();
  }

  protected loadContext(query: ListUserEmailsQuery): Promise<UserEmailProps[]> {
    return this.emails.listForUser(query.userId);
  }

  protected async handle(
    _query: ListUserEmailsQuery,
    emails: UserEmailProps[],
  ): Promise<auth.ListUserEmailsResponse> {
    return { items: sortForDisplay(emails).map(userEmailToContract) };
  }
}
