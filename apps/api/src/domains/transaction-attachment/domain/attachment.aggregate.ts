import type { transactions } from "@finance/contracts";

export interface AttachmentProps {
  id: string;
  userId: string;
  transactionId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

/**
 * A receipt attached to a movement. Its own aggregate root rather than an entity
 * of `Transaction`: it has a life of its own (uploaded and deleted without the
 * movement changing at all), and its bytes live outside the database entirely.
 */
export class Attachment {
  private constructor(private readonly props: AttachmentProps) {}

  static fromPersistence(props: AttachmentProps): Attachment {
    return new Attachment({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get storageKey(): string {
    return this.props.storageKey;
  }
  get transactionId(): string {
    return this.props.transactionId;
  }
  get contentType(): string {
    return this.props.contentType;
  }
  get fileName(): string {
    return this.props.fileName;
  }

  toContract(): transactions.Attachment {
    return {
      id: this.props.id,
      transactionId: this.props.transactionId,
      fileName: this.props.fileName,
      contentType: this.props.contentType as transactions.AttachmentContentType,
      sizeBytes: this.props.sizeBytes,
      createdAt: this.props.createdAt.toISOString(),
    };
  }
}
