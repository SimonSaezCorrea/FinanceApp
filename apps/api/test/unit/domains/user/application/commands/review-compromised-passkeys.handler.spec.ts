import { describe, expect, it, vi } from "vitest";

import { ReviewCompromisedPasskeysHandler } from "../../../../../../src/domains/user/application/commands/review-compromised-passkeys.handler";
import { ReviewCompromisedPasskeysCommand } from "../../../../../../src/domains/user/application/commands/review-compromised-passkeys.command";
import type { AuthenticatorModelRepositoryPort } from "../../../../../../src/domains/authenticator-model/domain/ports/authenticator-model.repository.port";
import type { PasskeyRepositoryPort } from "../../../../../../src/domains/passkey/domain/ports/passkey.repository.port";
import type { SessionRepositoryPort } from "../../../../../../src/domains/session/domain/ports/session.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";

const NOW = new Date("2026-11-05T06:00:00Z");

function setup(opts: {
  catalog?: { number: number; nextUpdate: Date } | null;
  compromised?: Map<string, string>;
  marked?: { id: string; userId: string; name: string }[];
}) {
  const models = {
    currentCatalog: vi
      .fn()
      .mockResolvedValue(
        opts.catalog === undefined
          ? { number: 7, nextUpdate: new Date("2026-12-01") }
          : opts.catalog,
      ),
    compromised: vi.fn().mockResolvedValue(opts.compromised ?? new Map()),
  } as unknown as AuthenticatorModelRepositoryPort;
  const passkeys = {
    markCompromisedWithTx: vi.fn().mockResolvedValue(opts.marked ?? []),
  } as unknown as PasskeyRepositoryPort;
  const sessions = {
    closeByPasskeysWithTx: vi.fn().mockResolvedValue(opts.marked?.length ?? 0),
    closeOnCompromisedPasskeysWithTx: vi.fn().mockResolvedValue(0),
  } as unknown as SessionRepositoryPort;
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as unknown as PrismaService;
  const publish = vi.fn();
  const handler = new ReviewCompromisedPasskeysHandler(
    { publish } as never,
    models,
    passkeys,
    sessions,
    prisma,
  );
  return { handler, passkeys, sessions, publish };
}

describe("ReviewCompromisedPasskeysHandler (specs/041 US3)", () => {
  it("marks, closes their sessions and notifies once per marked passkey", async () => {
    const compromised = new Map([["a-1", "REVOKED"]]);
    const marked = [
      { id: "p1", userId: "u1", name: "YubiKey del trabajo" },
      { id: "p2", userId: "u2", name: "Llave" },
    ];
    const { handler, passkeys, sessions, publish } = setup({ compromised, marked });
    const outcome = await handler.execute(new ReviewCompromisedPasskeysCommand(NOW));
    expect(outcome).toEqual({ marked: 2, sessionsClosed: 2 });
    expect(passkeys.markCompromisedWithTx).toHaveBeenCalledWith({}, compromised, NOW);
    expect(sessions.closeByPasskeysWithTx).toHaveBeenCalledWith({}, ["p1", "p2"], NOW);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        kind: "PASSKEY_COMPROMISED",
        detail: "YubiKey del trabajo",
      }),
    );
  });

  it("a rerun that marks nothing notifies nobody", async () => {
    const { handler, publish } = setup({ compromised: new Map([["a-1", "REVOKED"]]), marked: [] });
    expect(await handler.execute(new ReviewCompromisedPasskeysCommand(NOW))).toEqual({
      marked: 0,
      sessionsClosed: 0,
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("never marks with no catalog or an expired one", async () => {
    const none = setup({ catalog: null });
    expect((await none.handler.execute(new ReviewCompromisedPasskeysCommand(NOW))).skipped).toBe(
      "no-catalog",
    );
    const expired = setup({
      catalog: { number: 7, nextUpdate: new Date("2026-11-01") },
      compromised: new Map([["a-1", "REVOKED"]]),
    });
    expect((await expired.handler.execute(new ReviewCompromisedPasskeysCommand(NOW))).skipped).toBe(
      "expired-catalog",
    );
    expect(expired.passkeys.markCompromisedWithTx).not.toHaveBeenCalled();
  });
});
