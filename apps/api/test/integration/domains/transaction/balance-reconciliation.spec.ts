import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/**
 * SC-006 / quickstart scenario 15 — the accounting invariant of the whole app,
 * not of a single operation: after a batch of retried writes (each one resent
 * three times with its own key) plus two GENUINELY distinct movements that
 * happen to carry identical data, `currentBalance` still equals
 * `initialBalance + Σincome − Σexpense` and the movement count reflects only
 * the real writes, never the retries.
 */
describe("Balance reconciles after a batch of retries (integration, SC-006)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `reconcile_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let sourceAccountId: string;
  let destAccountId: string;

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
      .send({ email, password, name: "Reconciliation test" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const sourceRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta origen",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1111111",
        initialBalance: "500000",
      });
    sourceAccountId = sourceRes.body.id;

    const destRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta destino",
        type: "SAVINGS",
        currency: "CLP",
        accountNumber: "2222222",
        initialBalance: "0",
      });
    destAccountId = destRes.body.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { bankAccount: { user: { email } } } });
    await prisma.idempotencyRecord.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("hay 7 movimientos (5 + 2 duplicados legítimos) y el saldo cuadra tras retirar el traspaso", async () => {
    // 5 base movements, each resent 3 times under its OWN key — every retry
    // must replay, never re-apply.
    const baseMovements = [
      { type: "EXPENSE", amount: "12000", description: "Supermercado" },
      { type: "EXPENSE", amount: "8000", description: "Bencina" },
      { type: "INCOME", amount: "50000", description: "Reembolso" },
      { type: "EXPENSE", amount: "15000", description: "Farmacia" },
      { type: "INCOME", amount: "20000", description: "Venta" },
    ];

    // 2 movements that are GENUINELY distinct attempts (different keys) but
    // carry IDENTICAL data to one another — "dos cafés iguales" must both
    // land, unlike a retry of the same key.
    const identicalPairData = { type: "EXPENSE", amount: "3000", description: "Café" };

    let expectedDelta = 0;

    for (const movement of baseMovements) {
      const key = randomUUID();
      const body = {
        ...movement,
        currency: "CLP",
        occurredAt: new Date().toISOString(),
        bankAccountId: sourceAccountId,
      };
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await request(app.getHttpServer())
          .post("/api/v1/transactions")
          .set("Cookie", cookies)
          .set("Idempotency-Key", key)
          .send(body);
        expect(res.status).toBe(201);
      }
      expectedDelta +=
        movement.type === "INCOME" ? Number(movement.amount) : -Number(movement.amount);
    }

    for (let i = 0; i < 2; i++) {
      const key = randomUUID();
      const body = {
        ...identicalPairData,
        currency: "CLP",
        occurredAt: new Date().toISOString(),
        bankAccountId: sourceAccountId,
      };
      const res = await request(app.getHttpServer())
        .post("/api/v1/transactions")
        .set("Cookie", cookies)
        .set("Idempotency-Key", key)
        .send(body);
      expect(res.status).toBe(201);
      expectedDelta -= Number(identicalPairData.amount);
    }

    const movementCount = await prisma.transaction.count({
      where: { bankAccountId: sourceAccountId },
    });
    expect(movementCount).toBe(7);

    const afterMovements = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${sourceAccountId}`)
      .set("Cookie", cookies);
    expect(Number(afterMovements.body.currentBalance)).toBe(500000 + expectedDelta);

    // A retried transfer: three attempts under the same key move money once.
    const transferKey = randomUUID();
    const transferBody = {
      fromBankAccountId: sourceAccountId,
      toBankAccountId: destAccountId,
      amountOut: "40000",
      amountIn: "40000",
      currencyOut: "CLP",
      currencyIn: "CLP",
      occurredAt: new Date().toISOString(),
      description: "Ahorro del mes",
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/transactions/transfers")
        .set("Cookie", cookies)
        .set("Idempotency-Key", transferKey)
        .send(transferBody);
      expect(res.status).toBe(201);
    }
    expectedDelta -= 40000;

    const transferRows = await prisma.transaction.count({
      where: { bankAccountId: sourceAccountId, transferGroupId: { not: null } },
    });
    expect(transferRows).toBe(1);

    const finalSource = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${sourceAccountId}`)
      .set("Cookie", cookies);
    expect(Number(finalSource.body.currentBalance)).toBe(500000 + expectedDelta);

    const finalDest = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${destAccountId}`)
      .set("Cookie", cookies);
    expect(Number(finalDest.body.currentBalance)).toBe(40000);
  });
});
