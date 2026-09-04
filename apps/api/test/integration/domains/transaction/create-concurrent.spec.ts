import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/**
 * FR-006 (dos envíos simultáneos aplican el efecto una vez), proven against a
 * real Postgres through the real DI graph.
 *
 * This is the one thing fake ports cannot demonstrate: the guarantee comes from
 * the `@@unique([userId, key])` constraint racing genuinely concurrent inserts.
 * Hand-wiring the handler's dependencies would risk testing a wrong graph rather
 * than the real one, so this boots the full `AppModule` (same as the e2e tier)
 * and fires the requests over real HTTP.
 */
describe("POST /transactions — concurrent identical attempts (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `concurrent_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let accountId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Concurrency test" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const accountRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta de prueba",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1234567",
        initialBalance: "100000",
      });
    accountId = accountRes.body.id;
  });

  afterEach(async () => {
    await prisma.transaction.deleteMany({ where: { bankAccount: { user: { email } } } });
    await prisma.idempotencyRecord.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.update({
      where: { id: accountId },
      data: { currentBalance: "100000" },
    });
  });

  afterAll(async () => {
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("applies the effect exactly once under real concurrency, repeated over several rounds", async () => {
    for (let round = 0; round < 5; round++) {
      const key = randomUUID();
      const body = {
        type: "EXPENSE",
        amount: "12000",
        currency: "CLP",
        occurredAt: new Date().toISOString(),
        bankAccountId: accountId,
        description: `Ronda ${round}`,
      };

      // Fired together, not in sequence — the case the constraint exists for.
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(app.getHttpServer())
            .post("/api/v1/transactions")
            .set("Cookie", cookies)
            .set("Idempotency-Key", key)
            .send(body),
        ),
      );

      // Every successful response must describe the SAME row.
      const successes = results.filter((r) => r.status === 201);
      const ids = new Set(successes.map((r) => r.body.id));
      expect(ids.size).toBe(1);

      // Everything else must be the documented "still running" answer, never a
      // second effect landing under a different status.
      for (const r of results) {
        expect([201, 409]).toContain(r.status);
        if (r.status === 409) expect(r.body.error.code).toBe("IDEMPOTENCY_IN_PROGRESS");
      }

      const count = await prisma.transaction.count({
        where: { bankAccount: { user: { email } } },
      });
      expect(count).toBe(1);

      await prisma.transaction.deleteMany({ where: { bankAccount: { user: { email } } } });
      await prisma.idempotencyRecord.deleteMany({ where: { user: { email } } });
      await prisma.bankAccount.update({
        where: { id: accountId },
        data: { currentBalance: "100000" },
      });
    }
  });
});
