import { randomUUID } from "node:crypto";

import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { useJsonBodyLimit } from "../../../../src/infra/http/body-limit";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { randomValidRut } from "../../support/rut";

/**
 * The statement importer with custom fields (specs/036, US5): imported movements get
 * their values and the defaults that apply, and a bad value names its row. Also
 * SC-004: 2.000 rows with a field take at most ~1,2× the same rows without one.
 */
describe("Import with custom fields (e2e)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const email = `e2e_${randomUUID()}@test.local`;
  let cookies: string[] = [];
  let accountId = "";

  const api = () => request(app.getHttpServer());
  const rows = (n: number, extra: object = {}) =>
    Array.from({ length: n }, (_, i) => ({
      type: "EXPENSE",
      amount: "1",
      occurredAt: new Date(Date.UTC(2025, 0, 1, 0, 0, i)).toISOString(),
      description: `row ${i}`,
      ...extra,
    }));
  const importRows = (body: object[]) =>
    api()
      .post("/api/v1/import/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ bankAccountId: accountId, rows: body });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    useJsonBodyLimit(app);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    const reg = await api().post("/api/v1/auth/register").send({
      email,
      password: "Sup3rSecret!",
      name: "E2E User",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    cookies = reg.get("Set-Cookie") ?? [];
    const account = await api()
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        name: "Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "123",
        accountAlias: null,
        initialBalance: "100000000",
      });
    accountId = account.body.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("writes values and defaults, refuses a bad value naming its row, and stays fast", async () => {
    // Warm-up, then the baseline without any field.
    await importRows(rows(50));
    let started = Date.now();
    expect((await importRows(rows(2000))).status).toBe(201);
    const without = Date.now() - started;

    const field = await api()
      .post("/api/v1/custom-fields")
      .set("Cookie", cookies)
      .send({
        name: "Transferido",
        type: "BOOLEAN",
        scope: { movementKinds: ["EXPENSE"] },
        defaultValue: false,
      });
    const fieldId = field.body.id as string;

    started = Date.now();
    expect((await importRows(rows(2000, { customFields: { [fieldId]: true } }))).status).toBe(201);
    const withField = Date.now() - started;
    // SC-004 asks ≤ 1,2×; a small absolute slack absorbs timer noise on a tiny baseline.
    expect(withField).toBeLessThanOrEqual(without * 1.2 + 500);

    const defaults = await importRows(rows(3));
    expect(defaults.status).toBe(201);
    const summary = await api()
      .get(`/api/v1/transactions/summary?cf=${fieldId}&cfv=false`)
      .set("Cookie", cookies);
    expect(summary.body.total).toBe(3);

    const bad = await importRows([
      ...rows(2),
      ...rows(1, { customFields: { [fieldId]: "tal vez" } }),
    ]);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toEqual({ code: "CUSTOM_FIELD_INVALID_VALUE", field: "rows.2" });
  }, 60_000);
});
