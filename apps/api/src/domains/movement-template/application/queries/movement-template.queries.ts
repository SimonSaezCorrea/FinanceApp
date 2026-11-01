import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

/** Queries of the `movement-template` domain (specs/037). */
export class ListMovementTemplatesQuery implements UserScopedQuery {
  readonly scope = "user" as const;
  constructor(public readonly userId: string) {}
}
