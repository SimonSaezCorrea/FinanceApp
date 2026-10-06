import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LoginHandler } from "../../../../../src/domains/user/application/commands/login.handler";
import { LoginCommand } from "../../../../../src/domains/user/application/commands/login.command";
import type { SessionIssuer } from "../../../../../src/domains/user/application/session-issuer";
import type { TokenIssuer } from "../../../../../src/domains/user/application/token-issuer";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import { buildUserRepo } from "../../../support/repositories";

/**
 * Proves the password check runs on a locked row: N concurrent wrong passwords against a fresh
 * counter must count N times (without `SELECT … FOR UPDATE` they'd all read 0 and write 1), and
 * once locked, even the right password is refused.
 */
describe("login rate limit under concurrency (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  // Never reached in the concurrency test (every attempt is wrong); the last test only needs
  // to prove a session is NOT issued while locked.
  const sessionIssuer = {
    establish: () => Promise.reject(new Error("session must not be issued while locked")),
  } as unknown as SessionIssuer;
  const tokenIssuer = {} as TokenIssuer;
  // A fresh, valid RUT per run (body + módulo-11 check digit) so reruns never collide.
  const body = String(10_000_000 + Math.floor(Math.random() * 80_000_000));
  const rut = `${body}${checkDigit(body)}`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        email: `int_loginrate_${randomUUID()}@test.local`,
        name: "Login Rate Test",
        identifierType: "RUT",
        identifierValue: rut,
        passwordHash: await hash("secret123", 4),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const handler = () =>
    new LoginHandler({ publish: () => {} } as never, userRepo, tokenIssuer, sessionIssuer, prisma);

  it("5 concurrent wrong passwords each count exactly once, and the 5th locks", async () => {
    const attempts = Array.from({ length: 5 }, () =>
      handler()
        .execute(new LoginCommand({ identifierValue: rut, password: "wrong-one" }))
        .catch((e: { code?: string }) => e.code),
    );
    const codes = await Promise.all(attempts);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.loginFailedAttempts).toBe(5);
    expect(row.loginLockedUntil).not.toBeNull();
    expect(codes.filter((c) => c === "LOGIN_LOCKED")).toHaveLength(1);
    expect(codes.filter((c) => c === "INVALID_CREDENTIALS")).toHaveLength(4);
  });

  it("while locked, the right password is refused too", async () => {
    await expect(
      handler().execute(new LoginCommand({ identifierValue: rut, password: "secret123" })),
    ).rejects.toMatchObject({ code: "LOGIN_LOCKED" });
  });
});

function checkDigit(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  if (dv === 11) return "0";
  if (dv === 10) return "K";
  return String(dv);
}
