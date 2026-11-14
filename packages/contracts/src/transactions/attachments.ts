import { z } from "zod";

import { rowId } from "../common/row-id";

/** Receipt/voucher files attached to a movement. */

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
/** At most this many files on one movement (security run-3: storage had no bound at all). */
export const ATTACHMENT_MAX_PER_TRANSACTION = 10;
/** At most this many files, and this many bytes, across all of one person's movements. */
export const ATTACHMENT_MAX_PER_USER = 1000;
export const ATTACHMENT_MAX_BYTES_PER_USER = 500 * 1024 * 1024;

export const ATTACHMENT_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];

export const attachmentSchema = z.object({
  id: rowId,
  transactionId: rowId,
  fileName: z.string(),
  contentType: z.enum(ATTACHMENT_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/** Short-lived signed read URL — the API never proxies the bytes. */
export const attachmentUrlSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
});
export type AttachmentUrl = z.infer<typeof attachmentUrlSchema>;

/** Client-side pre-check, mirroring what the API enforces for real. */
export function isAllowedAttachmentType(contentType: string): contentType is AttachmentContentType {
  return (ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(contentType);
}
