import { EventBus } from "@nestjs/cqrs";
import { describe, expect, it, vi } from "vitest";

import { PurgeDeletedObjectsCommand } from "../../../../src/domains/storage-deletion/application/commands/purge-deleted-objects.command";
import {
  PURGE_BATCH,
  PURGE_MAX_ATTEMPTS,
  PurgeDeletedObjectsHandler,
} from "../../../../src/domains/storage-deletion/application/commands/purge-deleted-objects.handler";
import type { StorageDeletionRepositoryPort } from "../../../../src/domains/storage-deletion/domain/ports/storage-deletion.repository.port";
import type { ObjectStoragePort } from "../../../../src/domains/transaction-attachment/domain/ports/object-storage.port";

const eventBus = { publish: vi.fn() } as unknown as EventBus;

function fakeQueue(
  pending: { id: string; storageKey: string; attempts: number }[],
): StorageDeletionRepositoryPort {
  return {
    listPending: vi.fn(async () => pending),
    remove: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => {}),
    queuedKeys: vi.fn(async () => new Set<string>()),
    enqueue: vi.fn(async () => {}),
  };
}

function fakeStorage(overrides: Partial<ObjectStoragePort> = {}): ObjectStoragePort {
  return {
    isConfigured: () => true,
    put: vi.fn(),
    getSignedUrl: vi.fn(),
    delete: vi.fn(async () => {}),
    listPage: vi.fn(async () => ({ items: [], next: null })),
    ...overrides,
  };
}

describe("PurgeDeletedObjectsHandler", () => {
  it("deletes each queued object and forgets it; a failure is counted for a retry", async () => {
    const queue = fakeQueue([
      { id: "q1", storageKey: "k1", attempts: 0 },
      { id: "q2", storageKey: "k2", attempts: 3 },
    ]);
    const storage = fakeStorage({
      delete: vi.fn(async (key: string) => {
        if (key === "k2") throw new Error("S3 down");
      }),
    });
    const outcome = await new PurgeDeletedObjectsHandler(eventBus, queue, storage).execute(
      new PurgeDeletedObjectsCommand(),
    );
    expect(outcome).toEqual({ deleted: 1, failed: 1, skipped: false });
    expect(queue.remove).toHaveBeenCalledWith(["q1"]);
    expect(queue.recordFailure).toHaveBeenCalledWith(["q2"]);
  });

  it("asks the queue only for files below the retry limit (filtered in the query, run-4)", async () => {
    const queue = fakeQueue([]);
    const storage = fakeStorage();
    await new PurgeDeletedObjectsHandler(eventBus, queue, storage).execute(
      new PurgeDeletedObjectsCommand(),
    );
    expect(queue.listPending).toHaveBeenCalledWith(PURGE_BATCH, PURGE_MAX_ATTEMPTS);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("does nothing without object storage configured", async () => {
    const queue = fakeQueue([{ id: "q1", storageKey: "k1", attempts: 0 }]);
    const outcome = await new PurgeDeletedObjectsHandler(
      eventBus,
      queue,
      fakeStorage({ isConfigured: () => false }),
    ).execute(new PurgeDeletedObjectsCommand());
    expect(outcome.skipped).toBe(true);
    expect(queue.listPending).not.toHaveBeenCalled();
  });
});
