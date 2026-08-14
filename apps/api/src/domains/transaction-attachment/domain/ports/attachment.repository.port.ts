import type { Attachment, AttachmentProps } from "../attachment.aggregate";

export const ATTACHMENT_REPOSITORY = Symbol("ATTACHMENT_REPOSITORY");

/** Domain-owned port for the `transaction-attachment` table (one table, one
 *  adapter). Every method is scoped by `userId` — isolation is not optional. */
export interface AttachmentRepositoryPort {
  listForTransaction(userId: string, transactionId: string): Promise<Attachment[]>;
  findOne(userId: string, transactionId: string, attachmentId: string): Promise<Attachment | null>;
  save(props: Omit<AttachmentProps, "createdAt">): Promise<Attachment>;
  remove(userId: string, attachmentId: string): Promise<boolean>;
}

/* Ownership of the MOVEMENT is checked through the `transaction` domain's own
   port (`TransactionRepositoryPort.findOne`): that table has exactly one
   adapter, and it isn't this one. */
