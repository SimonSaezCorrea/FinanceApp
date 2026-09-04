import { describe, expect, it, vi } from "vitest";

import { PurgeExpiredRecordsCommand } from "../../../../src/domains/idempotency-record/application/commands/purge-expired-records.command";
import { PurgeExpiredRecordsHandler } from "../../../../src/domains/idempotency-record/application/commands/purge-expired-records.handler";
import { fakeIdempotencyRecordRepo } from "../../support/fake-ports";

describe("PurgeExpiredRecordsHandler", () => {
  it("is a system-scoped command, not tied to any user", () => {
    const command = new PurgeExpiredRecordsCommand();
    expect(command.scope).toBe("system");
  });

  it("delegates to the repository's deleteExpired with the command's cutoff", async () => {
    const deleteExpired = vi.fn().mockResolvedValue(7);
    const repo = fakeIdempotencyRecordRepo({ deleteExpired });
    const handler = new PurgeExpiredRecordsHandler({ publish: vi.fn() } as never, repo);
    const now = new Date("2026-09-03T00:00:00Z");

    const result = await handler.execute(new PurgeExpiredRecordsCommand(now));

    expect(result).toBe(7);
    expect(deleteExpired).toHaveBeenCalledWith(now);
  });

  it("returns 0 without error when nothing is expired", async () => {
    const repo = fakeIdempotencyRecordRepo();
    const handler = new PurgeExpiredRecordsHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(new PurgeExpiredRecordsCommand());

    expect(result).toBe(0);
  });
});
