import type { Attachment, AttachmentProps } from "../attachment.aggregate";

export const ATTACHMENT_REPOSITORY = Symbol("ATTACHMENT_REPOSITORY");

/** How many files the person keeps, their total size, and how many are on one movement. */
export interface AttachmentUsage {
  userCount: number;
  userBytes: number;
  transactionCount: number;
}

/** Domain-owned port for the `transaction-attachment` table (one table, one
 *  adapter). Every method is scoped by `userId` — isolation is not optional. */
export interface AttachmentRepositoryPort {
  listForTransaction(userId: string, transactionId: string): Promise<Attachment[]>;
  findOne(userId: string, transactionId: string, attachmentId: string): Promise<Attachment | null>;
  save(props: Omit<AttachmentProps, "createdAt">): Promise<Attachment>;
  /** Saves the row only if `fits` accepts the person's usage counted inside the same transaction,
   * with one upload per person at a time (security run-4: counting before the upload let parallel
   * uploads pass the quota together). Null when it doesn't fit. */
  saveWithinQuota(
    props: Omit<AttachmentProps, "createdAt">,
    fits: (usage: AttachmentUsage) => boolean,
  ): Promise<Attachment | null>;
  remove(userId: string, attachmentId: string): Promise<boolean>;
  /** Which of these storage keys still have a row. SYSTEM scope, no `userId`: only the orphan
   * sweep of the maintenance cron calls it (security run-3), and it returns nothing but keys. */
  existingStorageKeys(keys: string[]): Promise<Set<string>>;
  /** How many files the person keeps, their total size, and how many are on this movement. */
  usage(userId: string, transactionId: string): Promise<AttachmentUsage>;
}

/* Ownership of the MOVEMENT is checked through the `transaction` domain's own
   port (`TransactionRepositoryPort.findOne`): that table has exactly one
   adapter, and it isn't this one. */
