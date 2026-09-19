import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_COOKIE, JwtAuthGuard } from "../../../../src/infra/auth/jwt-auth.guard";
import type { PrismaService } from "../../../../src/infra/prisma/prisma.service";

const SECRET = "test-access";
const FUTURE = new Date(Date.now() + 60_000);
const PAST = new Date(Date.now() - 60_000);

function makeGuard(prisma: Partial<PrismaService>) {
  const jwt = new JwtService({});
  const config = { getOrThrow: () => SECRET, get: () => undefined };
  return new JwtAuthGuard(jwt, config as never, prisma as PrismaService);
}

function contextWithCookie(token: string | undefined): ExecutionContext {
  const req = { cookies: token ? { [ACCESS_COOKIE]: token } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/** A fake `prisma.session.findUnique({ where, select })` — the ONE query the guard
 * makes (specs/023 research.md R2): the session row's own aliveness (`closedAt`/
 * `expiresAt`), with its owner's `status` riding along via the relation include,
 * instead of a separate `prisma.user` query. */
function fakeSessionFindUnique(
  result: { closedAt: Date | null; expiresAt: Date; user: { status: string } } | null,
) {
  return { session: { findUnique: vi.fn().mockResolvedValue(result) } as never };
}

function openSession(status = "ACTIVE") {
  return { closedAt: null, expiresAt: FUTURE, user: { status } };
}

describe("JwtAuthGuard", () => {
  const jwt = new JwtService({});
  const sign = (sub: string, sid = "s1") =>
    jwt.sign({ sub, email: "a@b.com", sid }, { secret: SECRET });

  beforeEach(() => vi.clearAllMocks());

  it("rejects when there is no access-token cookie", async () => {
    const guard = makeGuard({});
    await expect(guard.canActivate(contextWithCookie(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("allows an active user with a valid token and a live, open session", async () => {
    const guard = makeGuard(fakeSessionFindUnique(openSession()));
    await expect(guard.canActivate(contextWithCookie(sign("u1")))).resolves.toBe(true);
  });

  it("rejects a disabled account even with a still-valid access token (FR-010)", async () => {
    const guard = makeGuard(fakeSessionFindUnique(openSession("DISABLED")));
    await expect(guard.canActivate(contextWithCookie(sign("u1")))).rejects.toMatchObject({
      response: { code: "ACCOUNT_DISABLED" },
    });
  });

  it("rejects when the session no longer exists (purged)", async () => {
    const guard = makeGuard(fakeSessionFindUnique(null));
    await expect(guard.canActivate(contextWithCookie(sign("u1")))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a closed session's access token immediately, without a different error code (specs/023 R2)", async () => {
    // The token's own signature/expiry are still perfectly valid — only the session
    // behind its `sid` has been closed since (closedAt stamped, row still exists for
    // the retention window). Same generic rejection as a missing/expired token, so a
    // closed session can't be distinguished by response shape from any other
    // unauthenticated state.
    const guard = makeGuard(
      fakeSessionFindUnique({ closedAt: PAST, expiresAt: FUTURE, user: { status: "ACTIVE" } }),
    );
    await expect(
      guard.canActivate(contextWithCookie(sign("u1", "closed-session"))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a session past its own expiresAt even before the daily cron marks it closed", async () => {
    const guard = makeGuard(
      fakeSessionFindUnique({ closedAt: null, expiresAt: PAST, user: { status: "ACTIVE" } }),
    );
    await expect(guard.canActivate(contextWithCookie(sign("u1")))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
