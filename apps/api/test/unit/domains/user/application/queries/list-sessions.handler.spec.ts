import { describe, expect, it, vi } from "vitest";

import { ListSessionsQueryHandler } from "../../../../../../src/domains/user/application/queries/list-sessions.handler";
import { ListSessionsQuery } from "../../../../../../src/domains/user/application/queries/list-sessions.query";
import type { SessionRepositoryPort } from "../../../../../../src/domains/session/domain/ports/session.repository.port";
import type { SessionProps } from "../../../../../../src/domains/session/domain/session.entity";

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

function session(overrides: Partial<SessionProps> = {}): SessionProps {
  return {
    id: "s1",
    userId: "u1",
    deviceLabel: "Chrome · Windows",
    country: "CL",
    city: "Santiago",
    createdAt: "2024-01-01T00:00:00Z",
    lastUsedAt: "2024-01-02T00:00:00Z",
    expiresAt: FUTURE,
    closedAt: null,
    ...overrides,
  };
}

function fakeSessions(overrides: Partial<SessionRepositoryPort> = {}): SessionRepositoryPort {
  return {
    create: vi.fn(),
    listByUser: vi.fn().mockResolvedValue([]),
    touch: vi.fn(),
    closeOwned: vi.fn(),
    existsForUser: vi.fn(),
    closeAllExceptForUser: vi.fn(),
    closeAllExceptForUserWithTx: vi.fn(),
    closeById: vi.fn(),
    markExpiredAsClosed: vi.fn(),
    purgeClosedBefore: vi.fn(),
    ...overrides,
  };
}

describe("ListSessionsQueryHandler", () => {
  it("marks the row matching the caller's own sessionId as isCurrent", async () => {
    const sessions = fakeSessions({
      listByUser: vi.fn().mockResolvedValue([session({ id: "s1" }), session({ id: "s2" })]),
    });
    const handler = new ListSessionsQueryHandler(sessions);

    const result = await handler.execute(new ListSessionsQuery("u1", "s2"));

    expect(result).toEqual([
      expect.objectContaining({ id: "s1", isCurrent: false, closedAt: null }),
      expect.objectContaining({ id: "s2", isCurrent: true, closedAt: null }),
    ]);
  });

  it("passes the caller's userId through to the repository", async () => {
    const sessions = fakeSessions();
    const handler = new ListSessionsQueryHandler(sessions);

    await handler.execute(new ListSessionsQuery("u1", "s1"));

    expect(sessions.listByUser).toHaveBeenCalledWith("u1");
  });

  it("returns an empty list when the caller has no sessions at all", async () => {
    const handler = new ListSessionsQueryHandler(fakeSessions());
    const result = await handler.execute(new ListSessionsQuery("u1", "s1"));
    expect(result).toEqual([]);
  });

  it("an explicitly closed session keeps its stored closedAt", async () => {
    const sessions = fakeSessions({
      listByUser: vi
        .fn()
        .mockResolvedValue([session({ id: "s1", closedAt: "2026-09-18T00:00:00Z" })]),
    });
    const handler = new ListSessionsQueryHandler(sessions);

    const result = await handler.execute(new ListSessionsQuery("u1", "s2"));

    expect(result[0]).toMatchObject({ id: "s1", closedAt: "2026-09-18T00:00:00Z" });
  });

  it("a session past its own expiresAt reads as closed even before the daily cron marks it", async () => {
    const sessions = fakeSessions({
      listByUser: vi
        .fn()
        .mockResolvedValue([session({ id: "s1", expiresAt: PAST, closedAt: null })]),
    });
    const handler = new ListSessionsQueryHandler(sessions);

    const result = await handler.execute(new ListSessionsQuery("u1", "s2"));

    expect(result[0]).toMatchObject({ id: "s1", closedAt: PAST });
  });
});
