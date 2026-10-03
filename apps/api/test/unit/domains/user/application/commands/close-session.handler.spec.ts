import { describe, expect, it, vi } from "vitest";

import { CloseSessionHandler } from "../../../../../../src/domains/user/application/commands/close-session.handler";
import { CloseSessionCommand } from "../../../../../../src/domains/user/application/commands/close-session.command";
import {
  SessionNotFoundError,
  StepUpRequiredError,
} from "../../../../../../src/domains/user/domain/errors";
import type { SessionRepositoryPort } from "../../../../../../src/domains/session/domain/ports/session.repository.port";
import type { SessionStepUpPort } from "../../../../../../src/domains/session/domain/ports/session-step-up.port";

function fakeSessions(overrides: Partial<SessionRepositoryPort> = {}): SessionRepositoryPort {
  return {
    create: vi.fn(),
    listByUser: vi.fn(),
    touch: vi.fn(),
    closeOwned: vi.fn().mockResolvedValue(undefined),
    existsForUser: vi.fn().mockResolvedValue(true),
    closeAllExceptForUser: vi.fn(),
    closeAllExceptForUserWithTx: vi.fn(),
    closeById: vi.fn(),
    markExpiredAsClosed: vi.fn(),
    purgeClosedBefore: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** A step-up done `ageMs` ago on the caller's session (`null` = never). */
function fakeStepUp(ageMs: number | null = 0): SessionStepUpPort {
  return {
    markSteppedUp: vi.fn(),
    steppedUpAt: vi.fn().mockResolvedValue(ageMs === null ? null : new Date(Date.now() - ageMs)),
  };
}

const MINUTE = 60 * 1000;

describe("CloseSessionHandler", () => {
  it("closes another session once the caller's own session stepped up recently", async () => {
    const sessions = fakeSessions();
    const stepUp = fakeStepUp(MINUTE);
    const handler = new CloseSessionHandler({ publish: vi.fn() } as never, sessions, stepUp);

    await handler.execute(new CloseSessionCommand("u1", "s1", "current"));

    expect(stepUp.steppedUpAt).toHaveBeenCalledWith("u1", "current");
    expect(sessions.closeOwned).toHaveBeenCalledWith("u1", "s1");
  });

  it("refuses to close another session without a step-up (STEP_UP_REQUIRED)", async () => {
    const sessions = fakeSessions();
    const handler = new CloseSessionHandler(
      { publish: vi.fn() } as never,
      sessions,
      fakeStepUp(null),
    );

    await expect(handler.execute(new CloseSessionCommand("u1", "s1", "current"))).rejects.toThrow(
      StepUpRequiredError,
    );
    expect(sessions.closeOwned).not.toHaveBeenCalled();
  });

  it("refuses once the 5-minute window has passed", async () => {
    const sessions = fakeSessions();
    const handler = new CloseSessionHandler(
      { publish: vi.fn() } as never,
      sessions,
      fakeStepUp(6 * MINUTE),
    );

    await expect(handler.execute(new CloseSessionCommand("u1", "s1", "current"))).rejects.toThrow(
      StepUpRequiredError,
    );
    expect(sessions.closeOwned).not.toHaveBeenCalled();
  });

  it("throws SESSION_NOT_FOUND for a foreign or nonexistent session", async () => {
    const sessions = fakeSessions({ existsForUser: vi.fn().mockResolvedValue(false) });
    const handler = new CloseSessionHandler({ publish: vi.fn() } as never, sessions, fakeStepUp());

    await expect(
      handler.execute(new CloseSessionCommand("u1", "not-mine", "current")),
    ).rejects.toThrow(SessionNotFoundError);
    expect(sessions.closeOwned).not.toHaveBeenCalled();
  });

  it("closing an already-closed session is a harmless no-op, not an error", async () => {
    // existsForUser only proves ownership — it doesn't say whether the row is still
    // open, so this exercises the idempotent path through closeOwned itself.
    const sessions = fakeSessions();
    const handler = new CloseSessionHandler({ publish: vi.fn() } as never, sessions, fakeStepUp());

    await expect(
      handler.execute(new CloseSessionCommand("u1", "already-closed", "current")),
    ).resolves.toBeUndefined();
  });

  it("closing the caller's own current session is just signing out — no step-up needed", async () => {
    const sessions = fakeSessions();
    const stepUp = fakeStepUp(null);
    const handler = new CloseSessionHandler({ publish: vi.fn() } as never, sessions, stepUp);

    await handler.execute(new CloseSessionCommand("u1", "current-session", "current-session"));

    expect(stepUp.steppedUpAt).not.toHaveBeenCalled();
    expect(sessions.closeOwned).toHaveBeenCalledWith("u1", "current-session");
  });
});
