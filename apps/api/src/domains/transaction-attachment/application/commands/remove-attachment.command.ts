import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class RemoveAttachmentCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly attachmentId: string,
  ) {}
}
