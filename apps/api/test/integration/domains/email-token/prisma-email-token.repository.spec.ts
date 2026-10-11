import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  expiresAtFor,
  generateToken,
} from "../../../../src/domains/email-token/domain/email-token";
import { PrismaEmailTokenRepository } from "../../../../src/domains/email-token/infrastructure/prisma-email-token.repository";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/** Real-DB integration (specs/032): a link is consumed exactly once even when two requests race,
 * an expired or replaced one is refused, and two concurrent issues leave one active link. */
describe("PrismaEmailTokenRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaEmailTokenRepository(prisma);
  const email = `int_et_${randomUUID()}@test.local`;
  let userId = "";

  const issue = (expiresAt = expiresAtFor("RESET_PASSWORD", new Date())) => {
    const { token, tokenHash } = generateToken();
    return repo
      .issue({ userId, purpose: "RESET_PASSWORD", userEmailId: null, tokenHash, expiresAt })
      .then((result) => ({ result, token, tokenHash }));
  };

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({ data: { email, name: "ET Int", passwordHash: "x" } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("two simultaneous consumptions of one link: exactly one wins", async () => {
    const { tokenHash } = await issue();
    const now = new Date();
    const results = await Promise.all(
      [0, 1].map(() =>
        prisma.$transaction((tx) => repo.consumeWithTx(tx, tokenHash, "RESET_PASSWORD", now)),
      ),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("an expired link is refused", async () => {
    const { tokenHash } = await issue(new Date(Date.now() - 1000));
    const consumed = await prisma.$transaction((tx) =>
      repo.consumeWithTx(tx, tokenHash, "RESET_PASSWORD", new Date()),
    );
    expect(consumed).toBeNull();
  });

  it("a new link replaces the previous one", async () => {
    const first = await issue();
    await issue();
    const consumed = await prisma.$transaction((tx) =>
      repo.consumeWithTx(tx, first.tokenHash, "RESET_PASSWORD", new Date()),
    );
    expect(consumed).toBeNull();
  });

  it("two simultaneous issues leave exactly one active link", async () => {
    await Promise.all([issue(), issue(), issue()]);
    const active = await prisma.emailToken.count({
      where: { userId, purpose: "RESET_PASSWORD", usedAt: null },
    });
    expect(active).toBe(1);
  });

  it("purges links used or expired before the cutoff", async () => {
    const purged = await repo.purgeStale(new Date());
    expect(purged).toBeGreaterThan(0);
  });
});
