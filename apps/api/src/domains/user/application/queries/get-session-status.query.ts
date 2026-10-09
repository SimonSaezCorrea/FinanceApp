import type { SystemCommand as SystemQuery } from "../../../../infra/cqrs/base-command.handler";

/** "Does this browser hold a live session?" — asked by the public site to offer "Ir a la app"
 * (spec 031). There is no authenticated user to scope it to (that is the question), so it is a
 * `SystemQuery`, the same pragmatic exception registration and the crons use. */
export class GetSessionStatusQuery implements SystemQuery {
  readonly scope = "system" as const;

  constructor(
    public readonly accessToken: string | undefined,
    public readonly refreshToken: string | undefined,
  ) {}
}
