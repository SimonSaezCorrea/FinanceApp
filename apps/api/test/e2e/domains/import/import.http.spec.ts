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
 * E2E test (mirrors savings'/debts' pattern): the full bulk-import HTTP flow
 * through the migrated Facade controller — must behave identically to the
 * pre-migration `ImportController`/`ImportService`. Requires a reachable
 * Postgres (real test DB), not part of `test:unit`.
 */
describe("Import HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_import_${randomUUID()}@test.local`;
  const otherEmail = `e2e_import_other_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let foreignAccountId: string;

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
      .send({ email, password, name: "E2E Import User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const registerOther = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: otherEmail, password, name: "Other" });
    const otherCookies = registerOther.get("Set-Cookie") ?? [];
    const otherAccount = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", otherCookies)
      .send({ name: "Other's account", type: "CHECKING", currency: "USD", accountNumber: "999" });
    foreignAccountId = otherAccount.body.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email: otherEmail } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  it("bulk-imports rows and returns the inserted count", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/import/transactions")
      .set("Cookie", cookies)
      .send({
        rows: [
          {
            type: "INCOME",
            amount: "100.00",
            currency: "USD",
            occurredAt: "2026-01-01T00:00:00.000Z",
          },
          {
            type: "EXPENSE",
            amount: "40.50",
            currency: "USD",
            occurredAt: "2026-01-02T00:00:00.000Z",
            category: "groceries",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ imported: 2 });
  });

  it("rejects an empty rows array (zod validation)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/import/transactions")
      .set("Cookie", cookies)
      .send({ rows: [] });

    expect(res.status).toBe(400);
  });

  // Principle II: a body-supplied FK must be ownership-verified before persisting.
  it("rejects a row whose bankAccountId belongs to another user", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/import/transactions")
      .set("Cookie", cookies)
      .send({
        rows: [
          {
            type: "EXPENSE",
            amount: "10.00",
            currency: "USD",
            occurredAt: "2026-01-01T00:00:00.000Z",
            bankAccountId: foreignAccountId,
          },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });
});
