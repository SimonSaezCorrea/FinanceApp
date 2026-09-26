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
 * E2E for importing a spreadsheet's movements into one account: the rows land
 * on that account, move its balance like hand-made movements, obey the movement
 * rules all-or-nothing, and the request is idempotent. Requires a reachable,
 * SEEDED Postgres (categories).
 */
describe("Import HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_import_${randomUUID()}@test.local`;
  const otherEmail = `e2e_import_other_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let checkingId: string;
  let prepaidId: string;
  let foreignAccountId: string;

  async function register(address: string): Promise<string[]> {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: address,
      password,
      name: "E2E Import",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    return res.get("Set-Cookie") ?? [];
  }

  async function createAccount(cookie: string[], body: Record<string, unknown>): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookie)
      .send(body);
    return res.body.id;
  }

  function importRows(body: Record<string, unknown>, key: string = randomUUID()) {
    return request(app.getHttpServer())
      .post("/api/v1/import/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send(body);
  }

  const balanceOf = async (id: string) =>
    Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id } })).currentBalance);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    cookies = await register(email);
    checkingId = await createAccount(cookies, {
      name: "Corriente",
      type: "CHECKING",
      currency: "CLP",
      accountNumber: "123",
      initialBalance: "100000",
    });
    prepaidId = await createAccount(cookies, {
      name: "Prepago",
      type: "PREPAID",
      currency: "CLP",
      accountNumber: "456",
      initialBalance: "10000",
    });
    foreignAccountId = await createAccount(await register(otherEmail), {
      name: "Other's account",
      type: "CHECKING",
      currency: "CLP",
      accountNumber: "999",
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({
      where: { user: { email: { in: [email, otherEmail] } } },
    });
    await prisma.bankAccount.deleteMany({
      where: { user: { email: { in: [email, otherEmail] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  it("imports the rows onto the account, in its currency, moving its balance", async () => {
    const supermarket = await categoryIdFor(prisma, "SUPERMARKET");
    const res = await importRows({
      bankAccountId: checkingId,
      rows: [
        { type: "INCOME", amount: "50000", occurredAt: "2026-09-01T00:00:00.000Z" },
        {
          type: "EXPENSE",
          amount: "20000",
          occurredAt: "2026-09-02T00:00:00.000Z",
          description: "Jumbo",
          categoryId: supermarket,
          observation: "boleta 123",
          emisor: "Javier",
          receptor: "Cencosud Retail",
          lugar: "Providencia",
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ imported: 2 });

    const rows = await prisma.transaction.findMany({
      where: { bankAccountId: checkingId },
      orderBy: { occurredAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.currency === "CLP")).toBe(true);
    expect(rows[1]).toMatchObject({
      description: "Jumbo",
      categoryId: supermarket,
      observation: "boleta 123",
      emisor: "Javier",
      receptor: "Cencosud Retail",
      lugar: "Providencia",
    });
    expect(await balanceOf(checkingId)).toBe(130000);
  });

  it("replays a retried request instead of importing twice", async () => {
    const key = randomUUID();
    const body = {
      bankAccountId: checkingId,
      rows: [{ type: "EXPENSE", amount: "1000", occurredAt: "2026-09-03T00:00:00.000Z" }],
    };
    const before = await balanceOf(checkingId);
    expect((await importRows(body, key)).status).toBe(201);
    expect((await importRows(body, key)).status).toBe(201);
    expect(await balanceOf(checkingId)).toBe(before - 1000);
  });

  it("refuses the whole file when one row breaks a rule, naming that row", async () => {
    // 10.000 on the prepaid account: the third 4.000 expense would take it negative.
    const res = await importRows({
      bankAccountId: prepaidId,
      rows: [
        { type: "EXPENSE", amount: "4000", occurredAt: "2026-09-01T00:00:00.000Z" },
        { type: "EXPENSE", amount: "4000", occurredAt: "2026-09-02T00:00:00.000Z" },
        { type: "EXPENSE", amount: "4000", occurredAt: "2026-09-03T00:00:00.000Z" },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "PREPAID_INSUFFICIENT_BALANCE", field: "rows.2" });
    // All-or-nothing: not even the first two landed.
    expect(await prisma.transaction.count({ where: { bankAccountId: prepaidId } })).toBe(0);
    expect(await balanceOf(prepaidId)).toBe(10000);
  });

  it("requires an Idempotency-Key", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/import/transactions")
      .set("Cookie", cookies)
      .send({
        bankAccountId: checkingId,
        rows: [{ type: "EXPENSE", amount: "1", occurredAt: "2026-09-01T00:00:00.000Z" }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  // Principle II: a body-supplied FK must be ownership-verified before persisting.
  it("rejects importing into another user's account", async () => {
    const res = await importRows({
      bankAccountId: foreignAccountId,
      rows: [{ type: "EXPENSE", amount: "1", occurredAt: "2026-09-01T00:00:00.000Z" }],
    });
    expect(res.status).toBe(404);
    expect(await prisma.transaction.count({ where: { bankAccountId: foreignAccountId } })).toBe(0);
  });

  it("rejects a non-positive amount before touching anything", async () => {
    const res = await importRows({
      bankAccountId: checkingId,
      rows: [{ type: "EXPENSE", amount: "-500", occurredAt: "2026-09-01T00:00:00.000Z" }],
    });
    expect(res.status).toBe(400);
  });
});
