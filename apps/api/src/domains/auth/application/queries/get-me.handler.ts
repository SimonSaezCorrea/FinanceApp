import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { UnauthorizedError } from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { GetMeQuery } from "./get-me.query";

@Injectable()
@QueryHandler(GetMeQuery)
export class GetMeQueryHandler extends BaseQueryHandler<GetMeQuery, auth.CurrentUser, User> {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort) {
    super();
  }

  protected async loadContext(query: GetMeQuery): Promise<User> {
    const user = await this.repo.findById(query.userId);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  protected async handle(_query: GetMeQuery, user: User): Promise<auth.CurrentUser> {
    return user.toContract();
  }
}
