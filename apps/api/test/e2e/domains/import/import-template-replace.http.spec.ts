import { randomUUID } from "node:crypto";

import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { generateRowId } from "../../../../src/infra/id/generate-row-id";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { useJsonBodyLimit } from "../../../../src/infra/http/body-limit";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { randomValidRut } from "../../support/rut";

const date = (d: string) => `${d}T00:00:00.000Z`;
const endOf = (d: string) => `${d}T23:59:59.999Z`;

/**
 * Template v2 REPLACE through the real HTTP surface: the preview counts what would
 * be deleted and writes nothing; the commit deletes every account and record of
 * the user and rebuilds them from the file — accounts, cards, movements, a
 * transfer, and a billing period generated and paid from another account like
 * the "Pagar" button. Requires a reachable, SEEDED Postgres (system categories).
 */
describe("Import template REPLACE (e2e)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const email = `e2e_replace_${randomUUID()}@test.local`;
  let cookies: string[] = [];

  const CHK = generateRowId();
  const TC = generateRowId();
  const CARD = generateRowId();

  const body = {
    mode: "REPLACE",
    accounts: [
      {
        row: 2,
        id: CHK,
        name: "BCI Nueva",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "999",
        openingBalance: "100000",
      },
      {
        row: 3,
        id: TC,
        name: "Visa Nueva",
        type: "CREDIT_CARD",
        currency: "CLP",
        creditLimit: "500000",
      },
    ],
    cards: [
      {
        row: 2,
        id: CARD,
        accountId: TC,
        kind: "CREDIT",
        last4: "1234",
        expiryMonth: 1,
        expiryYear: 2031,
      },
    ],
    movements: [
      {
        row: 2,
        occurredAt: date("2026-08-25"),
        type: "EXPENSE",
        amount: "30000",
        bankAccountId: TC,
        cardId: CARD,
      },
      {
        row: 3,
        occurredAt: date("2026-09-25"),
        type: "EXPENSE",
        amount: "5000",
        bankAccountId: TC,
        cardId: CARD,
      },
      {
        row: 4,
        occurredAt: date("2026-09-01"),
        type: "INCOME",
        amount: "20000",
        bankAccountId: CHK,
      },
    ],
    statements: [
      {
        row: 2,
        accountId: TC,
        periodStart: date("2026-08-20"),
        closedAt: endOf("2026-09-17"),
        dueDate: endOf("2026-10-05"),
        paidAt: date("2026-10-05"),
        paidAmount: "30000",
        paidFromAccountId: CHK,
      },
    ],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    useJsonBodyLimit(app);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password: "Sup3rSecret!",
      name: "E2E Replace",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    cookies = res.get("Set-Cookie") ?? [];
    // Something to be replaced: an account with a movement.
    const old = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Vieja",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1",
        initialBalance: "5",
      });
    expect(old.status).toBe(201);
    const mov = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        type: "EXPENSE",
        amount: "1",
        occurredAt: date("2026-09-01"),
        bankAccountId: old.body.id,
      });
    expect(mov.status).toBe(201);
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("previews what it deletes and writes nothing", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/import/template/preview")
      .set("Cookie", cookies)
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    // The cash account every user has, plus "Vieja".
    expect(res.body.replaces).toMatchObject({ accounts: 2, movements: 1 });
    expect(await prisma.bankAccount.count({ where: { user: { email } } })).toBe(2);
  });

  it("deletes everything and rebuilds it from the file", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/import/template")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(res.status).toBe(201);

    const accounts = await prisma.bankAccount.findMany({
      where: { user: { email } },
      orderBy: { name: "asc" },
    });
    // "Vieja" is gone; the file's two plus the cash account that must always exist.
    expect(accounts.map((a) => a.name)).toEqual(["BCI Nueva", "Efectivo", "Visa Nueva"]);
    const chk = accounts.find((a) => a.name === "BCI Nueva")!;
    const tc = accounts.find((a) => a.name === "Visa Nueva")!;
    // 100.000 + 20.000 − 30.000 paid to the card.
    expect(Number(chk.currentBalance)).toBe(90000);
    // 30.000 + 5.000 bought − 30.000 paid.
    expect(Number(tc.creditUsed)).toBe(5000);
    expect(Number(tc.creditLimit)).toBe(500000);

    const statements = await prisma.creditStatement.findMany({
      where: { accountId: tc.id },
      orderBy: { periodStart: "asc" },
    });
    expect(statements).toHaveLength(2);
    const [closed, open] = statements;
    expect(closed!.paidAt).not.toBeNull();
    expect(Number(closed!.amount)).toBe(30000);
    expect(closed!.paidFromAccountId).toBe(chk.id);
    expect(open!.closedAt).toBeNull();
    // The September purchase landed in the next, still open period.
    const later = await prisma.transaction.findFirstOrThrow({
      where: { bankAccountId: tc.id, amount: 5000 },
    });
    expect(later.creditStatementId).toBe(open!.id);
  });
});
