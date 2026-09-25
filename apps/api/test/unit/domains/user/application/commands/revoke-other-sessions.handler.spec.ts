import { describe, expect, it, vi } from "vitest";

import { RevokeOtherSessionsHandler } from "../../../../../../src/domains/user/application/commands/revoke-other-sessions.handler";
import { RevokeOtherSessionsCommand } from "../../../../../../src/domains/user/application/commands/revoke-other-sessions.command";
import { StepUpRequiredError } from "../../../../../../src/domains/user/domain/errors";
import type { SessionRepositoryPort } from "../../../../../../src/domains/session/domain/ports/session.repository.port";
import type { SessionStepUpPort } from "../../../../../../src/domains/session/domain/ports/session-step-up.port";

function fakeSessions(overrides: Partial<SessionRepositoryPort> = {}): SessionRepositoryPort {
  return {
    create: vi.fn(),
    listByUser: vi.fn(),
    touch: vi.fn(),
    closeOwned: vi.fn(),
    existsForUser: vi.fn(),
    closeAllExceptForUser: vi.fn().mockResolvedValue(2),
    closeAllExceptForUserWithTx: vi.fn(),
    closeById: vi.fn(),
    markExpiredAsClosed: vi.fn(),
    purgeClosedBefore: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeStepUp(steppedUp: boolean): SessionStepUpPort {
  return {
    markSteppedUp: vi.fn(),
    steppedUpAt: vi.fn().mockResolvedValue(steppedUp ? new Date() : null),
  };
}

describe("RevokeOtherSessionsHandler", () => {
  it("closes every session except the caller's own, once stepped up", async () => {
    const sessions = fakeSessions();
    const handler = new RevokeOtherSessionsHandler(
      { publish: vi.fn() } as never,
      sessions,
      fakeStepUp(true),
    );

    await handler.execute(new RevokeOtherSessionsCommand("u1", "current-session"));

    expect(sessions.closeAllExceptForUser).toHaveBeenCalledWith("u1", "current-session");
  });

  it("refuses without a recent step-up (STEP_UP_REQUIRED)", async () => {
    const sessions = fakeSessions();
    const handler = new RevokeOtherSessionsHandler(
      { publish: vi.fn() } as never,
      sessions,
      fakeStepUp(false),
    );

    await expect(
      handler.execute(new RevokeOtherSessionsCommand("u1", "current-session")),
    ).rejects.toThrow(StepUpRequiredError);
    expect(sessions.closeAllExceptForUser).not.toHaveBeenCalled();
  });

  it("is a no-op, not an error, when there are no other sessions", async () => {
    const sessions = fakeSessions({ closeAllExceptForUser: vi.fn().mockResolvedValue(0) });
    const handler = new RevokeOtherSessionsHandler(
      { publish: vi.fn() } as never,
      sessions,
      fakeStepUp(true),
    );

    await expect(
      handler.execute(new RevokeOtherSessionsCommand("u1", "only-session")),
    ).resolves.toBeUndefined();
  });
});
