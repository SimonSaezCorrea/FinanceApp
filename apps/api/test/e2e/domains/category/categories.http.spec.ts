import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { categoryIdFor } from "../../../integration/support/repositories";
import { randomValidRut } from "../../support/rut";

/**
 * E2E for the global category catalogue: `GET /categories` serves the seeded
 * rows, and a movement accepts only a category the user may pick for its type —
 * never a system one. Requires a reachable, SEEDED Postgres.
 */
describe("Categories HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_categories_${randomUUID()}@test.local`;
  let cookies: string[] = [];
  let cashAccountId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password: "Sup3rSecret!",
      name: "E2E Categories User",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    cookies = registerRes.get("Set-Cookie") ?? [];
    // Registration creates the always-present cash account.
    const accounts = await request(app.getHttpServer())
      .get("/api/v1/accounts")
      .set("Cookie", cookies);
    cashAccountId = accounts.body[0].id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  function postExpense(categoryId: string, type: "INCOME" | "EXPENSE" = "EXPENSE") {
    return request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        bankAccountId: cashAccountId,
        type,
        amount: "1000",
        currency: "CLP",
        occurredAt: new Date().toISOString(),
        categoryId,
      });
  }

  it("serves the same seeded catalogue to every user, system rows flagged", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/categories").set("Cookie", cookies);
    expect(res.status).toBe(200);
    const codes = res.body.map((c: { code: string }) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["SUPERMARKET", "SALARY", "OTHER", "SAVINGS"]));
    const savings = res.body.find((c: { code: string }) => c.code === "SAVINGS");
    expect(savings.isSystem).toBe(true);
  });

  it("requires authentication", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/categories");
    expect(res.status).toBe(401);
  });

  it("accepts a category of the movement's type and returns its id", async () => {
    const supermarket = await categoryIdFor(prisma, "SUPERMARKET");
    const res = await postExpense(supermarket);
    expect(res.status).toBe(201);
    expect(res.body.categoryId).toBe(supermarket);
  });

  it("rejects a system category", async () => {
    const res = await postExpense(await categoryIdFor(prisma, "STATEMENT_PAYMENT"));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "CATEGORY_NOT_ALLOWED", field: "categoryId" });
  });

  it("rejects an income category on an expense", async () => {
    const res = await postExpense(await categoryIdFor(prisma, "SALARY"));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CATEGORY_NOT_ALLOWED");
  });

  it("rejects an id that names no category", async () => {
    const res = await postExpense("01900000-0000-7000-8000-000000000000");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });
});
