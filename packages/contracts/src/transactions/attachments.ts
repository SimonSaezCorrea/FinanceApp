import { z } from "zod";

/** Receipt/voucher files attached to a movement. */

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export const ATTACHMENT_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];

export const attachmentSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
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
