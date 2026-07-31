import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

export class RefreshTokenCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly refreshToken: string | undefined) {}
}
