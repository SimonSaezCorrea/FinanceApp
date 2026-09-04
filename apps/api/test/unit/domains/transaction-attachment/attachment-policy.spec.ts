import { describe, expect, it } from "vitest";

import {
  AttachmentPolicy,
  storageKeyFor,
} from "../../../../src/domains/transaction-attachment/domain/attachment-policy";

const bytesOf = (...values: number[]) => new Uint8Array([...values, ...Array(16).fill(0)]);

const JPEG = bytesOf(0xff, 0xd8, 0xff);
const PNG = bytesOf(0x89, 0x50, 0x4e, 0x47);
const PDF = bytesOf(0x25, 0x50, 0x44, 0x46, 0x2d);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00,
]);

const upload = (over: Partial<Parameters<typeof AttachmentPolicy.validate>[0]> = {}) => ({
  fileName: "boleta.pdf",
  contentType: "application/pdf",
  sizeBytes: 1024,
  bytes: PDF,
  ...over,
});

describe("AttachmentPolicy", () => {
  it("accepts the four supported types with matching magic bytes", () => {
    const cases = [
      { contentType: "image/jpeg", bytes: JPEG },
      { contentType: "image/png", bytes: PNG },
      { contentType: "image/webp", bytes: WEBP },
      { contentType: "application/pdf", bytes: PDF },
    ];
    for (const c of cases) {
      expect(() => AttachmentPolicy.validate(upload(c))).not.toThrow();
    }
  });

  it("rejects a type outside the list", () => {
    expect(() =>
      AttachmentPolicy.validate(upload({ contentType: "application/zip" })),
    ).toThrowError(/ATTACHMENT_TYPE_NOT_ALLOWED/);
  });

  it("rejects bytes that don't match the declared type", () => {
    // A PDF renamed and declared as a PNG — the exact vector this closes.
    expect(() =>
      AttachmentPolicy.validate(upload({ contentType: "image/png", bytes: PDF })),
    ).toThrowError(/ATTACHMENT_TYPE_NOT_ALLOWED/);
  });

  it("rejects a file over 5 MB", () => {
    expect(() =>
      AttachmentPolicy.validate(upload({ sizeBytes: 5 * 1024 * 1024 + 1 })),
    ).toThrowError(/ATTACHMENT_TOO_LARGE/);
  });

  it("rejects an empty file", () => {
    expect(() => AttachmentPolicy.validate(upload({ sizeBytes: 0 }))).toThrowError(
      /ATTACHMENT_TYPE_NOT_ALLOWED/,
    );
  });
});

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("storageKeyFor", () => {
  it("takes no parameters and returns a UUID v4 string", () => {
    expect(storageKeyFor()).toMatch(UUID_V4);
  });

  it("never collides across many calls", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => storageKeyFor()));
    expect(keys.size).toBe(1000);
  });
});
