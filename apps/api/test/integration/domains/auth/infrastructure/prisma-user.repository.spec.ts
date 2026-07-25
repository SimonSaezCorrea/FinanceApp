import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaUserRepository } from "../../../../../src/domains/auth/infrastructure/prisma-user.repository";
import { EmailTakenError } from "../../../../../src/domains/auth/domain/errors";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing at
 * a reachable Postgres (see `docker-compose.yml` / `pnpm db:reset`). Not part
 * of `test:unit` (SC-002/SC-005). Not runnable in this sandbox (no reachable
 * Postgres) — written to the same contract `PrismaCreditStatementRepository`'s
 * integration test follows.
 */
describe("PrismaUserRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaUserRepository(prisma);
  const emailA = `int_${randomUUID()}@test.local`;
  const emailB = `int_${randomUUID()}@test.local`;
  const emailC = `int_${randomUUID()}@test.local`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB, emailC] } } });
    await prisma.$disconnect();
  });

  it("creates a user and finds it by email/id", async () => {
    const created = await repo.create({ email: emailA, name: "Int Test", passwordHash: "x" });
    expect(created.email).toBe(emailA);

    const byEmail = await repo.findByEmail(emailA);
    expect(byEmail?.id).toBe(created.id);

    const byId = await repo.findById(created.id);
    expect(byId?.email).toBe(emailA);
  });

  it("persists a profile/preferences update via save()", async () => {
    const created = await repo.create({ email: emailB, name: "Before", passwordHash: "x" });
    created.applyProfileUpdate({ name: "After" });
    created.applyPreferencesUpdate({ hideBalances: true, theme: "light" });
    await repo.save(created);

    const reloaded = await repo.findById(created.id);
    expect(reloaded?.name).toBe("After");
    expect(reloaded?.toContract().hideBalances).toBe(true);
    expect(reloaded?.toContract().theme).toBe("light");
  });

  it("save() maps a concurrent unique-email conflict to EmailTakenError", async () => {
    const created = await repo.create({ email: emailC, name: "Taker", passwordHash: "x" });
    // emailA is already taken by another row — forcing a P2002 on update.
    created.applyProfileUpdate({ email: emailA });
    await expect(repo.save(created)).rejects.toBeInstanceOf(EmailTakenError);
  });
});
