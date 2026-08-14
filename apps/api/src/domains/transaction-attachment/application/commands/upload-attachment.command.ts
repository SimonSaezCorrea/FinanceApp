import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class UploadAttachmentCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {}
}
