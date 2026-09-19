import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** No authenticated user is required to log out (the access token may already be
 * expired/missing) — same `scope: "system"` precedent as `RefreshTokenCommand`. */
export class LogoutCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly refreshToken: string | undefined) {}
}
