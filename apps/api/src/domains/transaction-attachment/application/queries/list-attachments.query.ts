import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

export class ListAttachmentsQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
  ) {}
}

export class GetAttachmentUrlQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly attachmentId: string,
  ) {}
}
