import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_COOKIE, JwtAuthGuard } from "./jwt-auth.guard";
import type { PrismaService } from "../prisma/prisma.service";

const SECRET = "test-access";

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

describe("JwtAuthGuard", () => {
  const jwt = new JwtService({});
  const sign = (sub: string) => jwt.sign({ sub, email: "a@b.com" }, { secret: SECRET });

  beforeEach(() => vi.clearAllMocks());

  it("rejects when there is no access-token cookie", async () => {
    const guard = makeGuard({});
    await expect(guard.canActivate(contextWithCookie(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("allows an active user with a valid token", async () => {
    const findUnique = vi.fn().mockResolvedValue({ status: "ACTIVE" });
    const guard = makeGuard({ user: { findUnique } as never });
    await expect(guard.canActivate(contextWithCookie(sign("u1")))).resolves.toBe(true);
  });

  it("rejects a disabled account even with a still-valid access token (FR-010)", async () => {
    const findUnique = vi.fn().mockResolvedValue({ status: "DISABLED" });
    const guard = makeGuard({ user: { findUnique } as never });
    await expect(guard.canActivate(contextWithCookie(sign("u1")))).rejects.toMatchObject({
      response: { code: "ACCOUNT_DISABLED" },
    });
  });

  it("rejects when the user no longer exists", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const guard = makeGuard({ user: { findUnique } as never });
    await expect(guard.canActivate(contextWithCookie(sign("u1")))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
