import { describe, expect, it, vi } from "vitest";

import { CloseSessionHandler } from "../../../../../../src/domains/user/application/commands/close-session.handler";
import { CloseSessionCommand } from "../../../../../../src/domains/user/application/commands/close-session.command";
import { SessionNotFoundError } from "../../../../../../src/domains/user/domain/errors";
import type { SessionRepositoryPort } from "../../../../../../src/domains/session/domain/ports/session.repository.port";

function fakeSessions(overrides: Partial<SessionRepositoryPort> = {}): SessionRepositoryPort {
  return {
    create: vi.fn(),
    listByUser: vi.fn(),
    touch: vi.fn(),
    closeOwned: vi.fn().mockResolvedValue(undefined),
    existsForUser: vi.fn().mockResolvedValue(true),
    closeAllExceptForUser: vi.fn(),
    closeById: vi.fn(),
    markExpiredAsClosed: vi.fn(),
    purgeClosedBefore: vi.fn(),
    ...overrides,
  };
}

describe("CloseSessionHandler", () => {
  it("closes a session that belongs to the caller", async () => {
    const sessions = fakeSessions();
    const handler = new CloseSessionHandler({ publish: vi.fn() } as never, sessions);

    await handler.execute(new CloseSessionCommand("u1", "s1"));

    expect(sessions.closeOwned).toHaveBeenCalledWith("u1", "s1");
  });

  it("throws SESSION_NOT_FOUND for a foreign or nonexistent session", async () => {
    const sessions = fakeSessions({ existsForUser: vi.fn().mockResolvedValue(false) });
    const handler = new CloseSessionHandler({ publish: vi.fn() } as never, sessions);

    await expect(handler.execute(new CloseSessionCommand("u1", "not-mine"))).rejects.toThrow(
      SessionNotFoundError,
    );
    expect(sessions.closeOwned).not.toHaveBeenCalled();
  });

  it("closing an already-closed session is a harmless no-op, not an error", async () => {
    // existsForUser only proves ownership — it doesn't say whether the row is still
    // open, so this exercises the idempotent path through closeOwned itself.
    const sessions = fakeSessions();
    const handler = new CloseSessionHandler({ publish: vi.fn() } as never, sessions);

    await expect(
      handler.execute(new CloseSessionCommand("u1", "already-closed")),
    ).resolves.toBeUndefined();
  });

  it("closing the caller's own current session works the same as any other (no special-casing)", async () => {
    const sessions = fakeSessions();
    const handler = new CloseSessionHandler({ publish: vi.fn() } as never, sessions);

    await handler.execute(new CloseSessionCommand("u1", "current-session"));

    expect(sessions.closeOwned).toHaveBeenCalledWith("u1", "current-session");
  });
});
