import { transactions } from "@finance/contracts";

import { AttachmentTooLargeError, AttachmentTypeNotAllowedError } from "./errors";

/**
 * The first bytes each supported format must start with. The `Content-Type` is
 * chosen by the CLIENT, so trusting it would let an executable renamed to `.pdf`
 * through and be served back later under that very type — the one vector this
 * check closes. No dependency needed: four prefix comparisons.
 */
const MAGIC: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  // RIFF....WEBP — the size lives in bytes 4-7, so they're skipped.
  "image/webp": (b) =>
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50,
  // "%PDF-"
  "application/pdf": (b) =>
    b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
};

export interface AttachmentUpload {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  bytes: Uint8Array;
}

export const AttachmentPolicy = {
  validate(upload: AttachmentUpload): void {
    if (!transactions.isAllowedAttachmentType(upload.contentType)) {
      throw new AttachmentTypeNotAllowedError();
    }
    if (upload.sizeBytes > transactions.ATTACHMENT_MAX_BYTES) throw new AttachmentTooLargeError();
    if (upload.sizeBytes <= 0) throw new AttachmentTypeNotAllowedError();
    const matches = MAGIC[upload.contentType];
    if (!matches || !matches(upload.bytes)) throw new AttachmentTypeNotAllowedError();
  },
};

/** Object key: derived from the attachment's own id, never from the uploaded
 *  name, so two files called the same on one movement can coexist. */
export function storageKeyFor(input: {
  userId: string;
  transactionId: string;
  attachmentId: string;
  fileName: string;
}): string {
  const slug =
    input.fileName
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file";
  return `u/${input.userId}/t/${input.transactionId}/${input.attachmentId}-${slug}`;
}
