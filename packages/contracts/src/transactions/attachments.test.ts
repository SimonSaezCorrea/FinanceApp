import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_CONTENT_TYPES,
  ATTACHMENT_MAX_BYTES,
  attachmentSchema,
  attachmentUrlSchema,
  isAllowedAttachmentType,
} from "./attachments";

const base = {
  id: "018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e6f",
  transactionId: "018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e70",
  fileName: "boleta.pdf",
  contentType: "application/pdf",
  sizeBytes: 1024,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("attachmentSchema", () => {
  it("accepts every allowed content type", () => {
    for (const contentType of ATTACHMENT_CONTENT_TYPES) {
      expect(attachmentSchema.safeParse({ ...base, contentType }).success).toBe(true);
    }
  });

  it("rejects a content type outside the list", () => {
    expect(attachmentSchema.safeParse({ ...base, contentType: "application/zip" }).success).toBe(
      false,
    );
  });

  it("rejects a file over the 5 MB cap", () => {
    expect(
      attachmentSchema.safeParse({ ...base, sizeBytes: ATTACHMENT_MAX_BYTES + 1 }).success,
    ).toBe(false);
    expect(attachmentSchema.safeParse({ ...base, sizeBytes: ATTACHMENT_MAX_BYTES }).success).toBe(
      true,
    );
  });

  it("rejects an empty file", () => {
    expect(attachmentSchema.safeParse({ ...base, sizeBytes: 0 }).success).toBe(false);
  });
});

describe("isAllowedAttachmentType", () => {
  it("narrows only the four supported types", () => {
    expect(isAllowedAttachmentType("image/png")).toBe(true);
    expect(isAllowedAttachmentType("text/html")).toBe(false);
  });
});

describe("attachmentUrlSchema", () => {
  it("requires a real url", () => {
    expect(
      attachmentUrlSchema.safeParse({
        url: "https://bucket.example/obj?sig=x",
        expiresAt: "2026-08-01T00:05:00.000Z",
      }).success,
    ).toBe(true);
    expect(attachmentUrlSchema.safeParse({ url: "not-a-url", expiresAt: "x" }).success).toBe(false);
  });
});
