import { EventBus } from "@nestjs/cqrs";
import { describe, expect, it, vi } from "vitest";

import { RemoveAttachmentCommand } from "../../../../src/domains/transaction-attachment/application/commands/remove-attachment.command";
import { RemoveAttachmentHandler } from "../../../../src/domains/transaction-attachment/application/commands/remove-attachment.handler";
import { UploadAttachmentCommand } from "../../../../src/domains/transaction-attachment/application/commands/upload-attachment.command";
import { UploadAttachmentHandler } from "../../../../src/domains/transaction-attachment/application/commands/upload-attachment.handler";
import {
  GetAttachmentUrlQueryHandler,
  ListAttachmentsQueryHandler,
} from "../../../../src/domains/transaction-attachment/application/queries/list-attachments.handler";
import {
  GetAttachmentUrlQuery,
  ListAttachmentsQuery,
} from "../../../../src/domains/transaction-attachment/application/queries/list-attachments.query";
import { Attachment } from "../../../../src/domains/transaction-attachment/domain/attachment.aggregate";
import type { AttachmentRepositoryPort } from "../../../../src/domains/transaction-attachment/domain/ports/attachment.repository.port";
import type { ObjectStoragePort } from "../../../../src/domains/transaction-attachment/domain/ports/object-storage.port";
import type { TransactionRepositoryPort } from "../../../../src/domains/transaction/domain/ports/transaction.repository.port";

const eventBus = { publish: vi.fn() } as unknown as EventBus;

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const attachment = () =>
  Attachment.fromPersistence({
    id: "at1",
    userId: "u1",
    transactionId: "t1",
    storageKey: "u/u1/t/t1/at1-boleta.pdf",
    fileName: "boleta.pdf",
    contentType: "application/pdf",
    sizeBytes: PDF.length,
    createdAt: new Date("2026-08-01"),
  });

/** In-memory storage — the unit tier never touches the network. */
function fakeStorage(overrides: Partial<ObjectStoragePort> = {}): ObjectStoragePort {
  const objects = new Map<string, Uint8Array>();
  return {
    isConfigured: () => true,
    put: vi.fn(async (key: string, body: Uint8Array) => void objects.set(key, body)),
    getSignedUrl: vi.fn(async (key: string) => `https://bucket.test/${key}?sig=x`),
    delete: vi.fn(async (key: string) => void objects.delete(key)),
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<AttachmentRepositoryPort> = {}): AttachmentRepositoryPort {
  return {
    listForTransaction: vi.fn(async () => [attachment()]),
    findOne: vi.fn(async () => attachment()),
    save: vi.fn(async () => attachment()),
    remove: vi.fn(async () => true),
    ...overrides,
  };
}

const fakeTransactions = (found = true) =>
  ({
    findOne: vi.fn(async () => (found ? { id: "t1" } : null)),
  }) as unknown as TransactionRepositoryPort;

const file = {
  originalname: "boleta.pdf",
  mimetype: "application/pdf",
  size: PDF.length,
  buffer: PDF,
};

describe("UploadAttachmentHandler", () => {
  it("stores the object and the row", async () => {
    const repo = fakeRepo();
    const storage = fakeStorage();
    const handler = new UploadAttachmentHandler(eventBus, repo, storage, fakeTransactions());

    const result = await handler.execute(new UploadAttachmentCommand("u1", "t1", file));

    expect(storage.put).toHaveBeenCalledOnce();
    // specs/017: the storage key is an opaque random value, unrelated to any id.
    expect(vi.mocked(repo.save).mock.calls[0]![0].storageKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.fileName).toBe("boleta.pdf");
  });

  it("503s with no storage configured, without touching the database", async () => {
    const repo = fakeRepo();
    const handler = new UploadAttachmentHandler(
      eventBus,
      repo,
      fakeStorage({ isConfigured: () => false }),
      fakeTransactions(),
    );

    await expect(handler.execute(new UploadAttachmentCommand("u1", "t1", file))).rejects.toThrow(
      /ATTACHMENTS_UNAVAILABLE/,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("404s on a movement that isn't the user's, before uploading anything", async () => {
    const storage = fakeStorage();
    const handler = new UploadAttachmentHandler(
      eventBus,
      fakeRepo(),
      storage,
      fakeTransactions(false),
    );

    await expect(handler.execute(new UploadAttachmentCommand("u1", "t1", file))).rejects.toThrow(
      /TRANSACTION_NOT_FOUND/,
    );
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("rejects bytes that don't match the declared type", async () => {
    const handler = new UploadAttachmentHandler(
      eventBus,
      fakeRepo(),
      fakeStorage(),
      fakeTransactions(),
    );
    await expect(
      handler.execute(new UploadAttachmentCommand("u1", "t1", { ...file, mimetype: "image/png" })),
    ).rejects.toThrow(/ATTACHMENT_TYPE_NOT_ALLOWED/);
  });
});

describe("RemoveAttachmentHandler", () => {
  it("deletes the row and then the object", async () => {
    const repo = fakeRepo();
    const storage = fakeStorage();
    const handler = new RemoveAttachmentHandler(eventBus, repo, storage);

    await handler.execute(new RemoveAttachmentCommand("u1", "t1", "at1"));

    expect(repo.remove).toHaveBeenCalledWith("u1", "at1");
    expect(storage.delete).toHaveBeenCalledWith("u/u1/t/t1/at1-boleta.pdf");
  });

  it("still succeeds when the bucket refuses (an orphan object is logged, not fatal)", async () => {
    const handler = new RemoveAttachmentHandler(
      eventBus,
      fakeRepo(),
      fakeStorage({
        delete: vi.fn(async () => {
          throw new Error("network");
        }),
      }),
    );
    await expect(
      handler.execute(new RemoveAttachmentCommand("u1", "t1", "at1")),
    ).resolves.toBeUndefined();
  });

  it("404s on an attachment that isn't the user's", async () => {
    const handler = new RemoveAttachmentHandler(
      eventBus,
      fakeRepo({ findOne: vi.fn(async () => null) }),
      fakeStorage(),
    );
    await expect(handler.execute(new RemoveAttachmentCommand("u1", "t1", "at1"))).rejects.toThrow(
      /ATTACHMENT_NOT_FOUND/,
    );
  });
});

describe("attachment queries", () => {
  it("lists them even with no storage configured", async () => {
    const handler = new ListAttachmentsQueryHandler(fakeRepo());
    const rows = await handler.execute(new ListAttachmentsQuery("u1", "t1"));
    expect(rows).toHaveLength(1);
  });

  it("signs a short-lived url", async () => {
    const handler = new GetAttachmentUrlQueryHandler(fakeRepo(), fakeStorage());
    const result = await handler.execute(new GetAttachmentUrlQuery("u1", "t1", "at1"));
    expect(result.url).toContain("https://bucket.test/");
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("503s the url with no storage configured", async () => {
    const handler = new GetAttachmentUrlQueryHandler(
      fakeRepo(),
      fakeStorage({ isConfigured: () => false }),
    );
    await expect(handler.execute(new GetAttachmentUrlQuery("u1", "t1", "at1"))).rejects.toThrow(
      /ATTACHMENTS_UNAVAILABLE/,
    );
  });
});
