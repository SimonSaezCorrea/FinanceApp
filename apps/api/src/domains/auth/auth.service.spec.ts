import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service";
import type { AuthRepository } from "./auth.repository";

const SECRETS: Record<string, string> = {
  JWT_ACCESS_SECRET: "test-access",
  JWT_REFRESH_SECRET: "test-refresh",
};

function makeService(repo: Partial<AuthRepository>) {
  const config = { getOrThrow: (k: string) => SECRETS[k], get: () => undefined };
  return new AuthService(repo as AuthRepository, new JwtService({}), config as never);
}

describe("AuthService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("register hashes the password and rejects duplicates", async () => {
    const create = vi.fn().mockResolvedValue({ id: "u1", email: "a@b.com", name: null });
    const svc = makeService({ findByEmail: vi.fn().mockResolvedValue(null), create });

    const user = await svc.register({ email: "A@B.com", password: "password123" });

    expect(user).toEqual({ id: "u1", email: "a@b.com" });
    const arg = create.mock.calls[0]![0] as { email: string; passwordHash: string };
    expect(arg.email).toBe("a@b.com"); // lowercased
    expect(arg.passwordHash).not.toBe("password123"); // hashed
  });

  it("register throws ConflictException when email exists", async () => {
    const svc = makeService({ findByEmail: vi.fn().mockResolvedValue({ id: "x" }) });
    await expect(
      svc.register({ email: "a@b.com", password: "password123" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("validateCredentials accepts a correct password and rejects a wrong one", async () => {
    const passwordHash = await hash("secret123", 1);
    const svc = makeService({
      findByEmail: vi.fn().mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash }),
    });

    await expect(
      svc.validateCredentials({ email: "a@b.com", password: "secret123" }),
    ).resolves.toEqual({ id: "u1", email: "a@b.com" });
    await expect(
      svc.validateCredentials({ email: "a@b.com", password: "wrong" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("issues tokens and rotates them from a valid refresh token", async () => {
    const svc = makeService({
      findById: vi.fn().mockResolvedValue({ id: "u1", email: "a@b.com" }),
    });
    const { accessToken, refreshToken } = svc.issueTokens({ id: "u1", email: "a@b.com" });
    expect(accessToken).toBeTypeOf("string");

    const rotated = await svc.rotateFromRefresh(refreshToken);
    expect(rotated.accessToken).toBeTypeOf("string");
    expect(rotated.refreshToken).toBeTypeOf("string");
  });

  it("rejects a missing refresh token", async () => {
    const svc = makeService({});
    await expect(svc.rotateFromRefresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
