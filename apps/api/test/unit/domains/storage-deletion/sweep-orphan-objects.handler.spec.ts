import { EventBus } from "@nestjs/cqrs";
import { describe, expect, it, vi } from "vitest";

import { SweepOrphanObjectsCommand } from "../../../../src/domains/storage-deletion/application/commands/sweep-orphan-objects.command";
import {
  SWEEP_MAX_PAGES,
  SweepOrphanObjectsHandler,
} from "../../../../src/domains/storage-deletion/application/commands/sweep-orphan-objects.handler";
import type { StorageDeletionRepositoryPort } from "../../../../src/domains/storage-deletion/domain/ports/storage-deletion.repository.port";
import type { AttachmentRepositoryPort } from "../../../../src/domains/transaction-attachment/domain/ports/attachment.repository.port";
import type { ObjectStoragePort } from "../../../../src/domains/transaction-attachment/domain/ports/object-storage.port";

const eventBus = { publish: vi.fn() } as unknown as EventBus;
const NOW = new Date("2026-11-14T12:00:00Z");
const OLD = new Date("2026-11-01T00:00:00Z");
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function build(
  pages: { key: string; lastModified: Date | null }[][],
  kept: string[],
  queued: string[],
) {
  let call = 0;
  const storage = {
    isConfigured: () => true,
    put: vi.fn(),
    getSignedUrl: vi.fn(),
    delete: vi.fn(),
    listPage: vi.fn(async () => {
      const items = pages[call] ?? [];
      call += 1;
      return { items, next: call < pages.length ? `c${call}` : null };
    }),
  } as unknown as ObjectStoragePort;
  const attachments = {
    existingStorageKeys: vi.fn(
      async (keys: string[]) => new Set(keys.filter((k) => kept.includes(k))),
    ),
  } as unknown as AttachmentRepositoryPort;
  const queue = {
    listPending: vi.fn(),
    remove: vi.fn(),
    recordFailure: vi.fn(),
    queuedKeys: vi.fn(async (keys: string[]) => new Set(keys.filter((k) => queued.includes(k)))),
    enqueue: vi.fn(async () => {}),
  } as unknown as StorageDeletionRepositoryPort;
  return {
    handler: new SweepOrphanObjectsHandler(eventBus, storage, attachments, queue),
    queue,
    storage,
  };
}

describe("SweepOrphanObjectsHandler (security run-3)", () => {
  it("queues only old files that have no row and aren't queued yet, across pages", async () => {
    const { handler, queue } = build(
      [
        [
          { key: key(1), lastModified: OLD }, // orphan
          { key: key(2), lastModified: OLD }, // still has its row
          { key: key(3), lastModified: new Date("2026-11-14T06:00:00Z") }, // too recent
        ],
        [
          { key: key(4), lastModified: OLD }, // already queued
          { key: "not-ours/readme.txt", lastModified: OLD }, // not a key this app writes
          { key: key(5), lastModified: OLD }, // orphan
        ],
      ],
      [key(2)],
      [key(4)],
    );
    const outcome = await handler.execute(new SweepOrphanObjectsCommand(NOW));
    expect(outcome).toEqual({ scanned: 6, queued: 2, skipped: false });
    expect(vi.mocked(queue.enqueue).mock.calls.flatMap(([keys]) => keys)).toEqual([key(1), key(5)]);
  });

  it("does nothing without object storage configured", async () => {
    const { handler, storage } = build([], [], []);
    (storage as { isConfigured: () => boolean }).isConfigured = () => false;
    const outcome = await handler.execute(new SweepOrphanObjectsCommand(NOW));
    expect(outcome.skipped).toBe(true);
    expect(storage.listPage).not.toHaveBeenCalled();
  });

  it("resumes after the last key it reached when a run stops at the page cap (security run-4)", async () => {
    const pages = Array.from({ length: SWEEP_MAX_PAGES + 2 }, (_, i) => [
      { key: key(i + 1), lastModified: OLD },
    ]);
    const { handler, storage } = build(pages, [], []);
    await handler.execute(new SweepOrphanObjectsCommand(NOW));
    const calls = vi.mocked(storage.listPage).mock.calls;
    expect(calls).toHaveLength(SWEEP_MAX_PAGES);
    expect(calls[0]![2]).toBeNull();
    await handler.execute(new SweepOrphanObjectsCommand(NOW));
    expect(vi.mocked(storage.listPage).mock.calls[SWEEP_MAX_PAGES]![2]).toBe(key(SWEEP_MAX_PAGES));
  });
});
