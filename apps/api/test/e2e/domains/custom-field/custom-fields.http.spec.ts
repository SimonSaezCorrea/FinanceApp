import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { randomValidRut } from "../../support/rut";

/**
 * Custom fields over HTTP (specs/036): define "Transferido", movements born with its
 * default, edit one movement's value (even a read-only one), filter and sum, assign
 * in bulk with undo, and "Transferir pendientes" with its undo by deleting the
 * transfer. Requires a reachable Postgres.
 */
describe("Custom fields HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails = [`e2e_${randomUUID()}@test.local`, `e2e_${randomUUID()}@test.local`];
  let cookies: string[] = [];
  let otherCookies: string[] = [];
  let checking = "";
  let savings = "";
  let creditAccount = "";
  let creditCard = "";
  let fieldId = "";
  const expenses: string[] = [];
  let income = "";

  const api = () => request(app.getHttpServer());

  async function register(email: string): Promise<string[]> {
    const res = await api().post("/api/v1/auth/register").send({
      email,
      password: "Sup3rSecret!",
      name: "E2E User",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    expect(res.status).toBe(201);
    return res.get("Set-Cookie") ?? [];
  }

  const post = (url: string, body: object, c = cookies) =>
    api().post(url).set("Cookie", c).set("Idempotency-Key", randomUUID()).send(body);

  async function account(name: string, initialBalance: string) {
    const res = await post("/api/v1/accounts", {
      name,
      type: "CHECKING",
      currency: "CLP",
      accountNumber: "12345",
      accountAlias: null,
      initialBalance,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function creditExpense(amount: string) {
    const res = await post("/api/v1/transactions", {
      type: "EXPENSE",
      amount,
      currency: "CLP",
      occurredAt: "2026-10-01T12:00:00.000Z",
      bankAccountId: creditAccount,
      cardId: creditCard,
    });
    expect(res.status).toBe(201);
    return res.body;
  }

  const summary = async (query: string) =>
    (await api().get(`/api/v1/transactions/summary?${query}`).set("Cookie", cookies)).body;
  const valueOf = async (id: string) =>
    (await api().get(`/api/v1/transactions/${id}`).set("Cookie", cookies)).body.customFields?.[
      fieldId
    ];
  const balanceOf = async (id: string) =>
    (await api().get(`/api/v1/accounts/${id}`).set("Cookie", cookies)).body
      .currentBalance as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    cookies = await register(emails[0]!);
    otherCookies = await register(emails[1]!);
    checking = await account("Corriente", "1000000");
    savings = await account("MACH", "0");
    const credit = await post("/api/v1/accounts", {
      name: "Visa",
      type: "CREDIT_CARD",
      currency: "CLP",
      creditLimit: "2000000",
      cards: [
        {
          name: "Visa",
          kind: "CREDIT",
          last4: "4321",
          expiryMonth: 12,
          expiryYear: 2030,
          limits: [{ currency: "CLP", limitAmount: "2000000" }],
        },
      ],
    });
    expect(credit.status).toBe(201);
    creditAccount = credit.body.id;
    creditCard = credit.body.cards[0].id;
    // One credit expense that exists BEFORE the field.
    expenses.push((await creditExpense("1000")).id);
  });

  afterAll(async () => {
    for (const email of emails) {
      await prisma.transaction.deleteMany({ where: { user: { email } } });
      await prisma.creditStatement.deleteMany({ where: { account: { user: { email } } } });
      await prisma.bankAccount.deleteMany({ where: { user: { email } } });
      await prisma.user.deleteMany({ where: { email } });
    }
    await app.close();
  });

  it("counts the existing movements a scope covers and creates the field", async () => {
    const scope = { movementKinds: ["EXPENSE"], cardKinds: ["CREDIT"] };
    const count = await post("/api/v1/custom-fields/scope-count", { scope });
    expect(count.body).toEqual({ count: 1 });

    const res = await post("/api/v1/custom-fields", {
      name: "Transferido",
      type: "BOOLEAN",
      scope,
      defaultValue: false,
      showAsColumn: true,
      applyDefaultToExisting: true,
    });
    expect(res.status).toBe(201);
    fieldId = res.body.id;
    expect(res.body).toMatchObject({ name: "Transferido", valueCount: 1, scopeBroken: false });
    expect(await valueOf(expenses[0]!)).toBe(false);
  });

  it("refuses a repeated name and a scope account of someone else", async () => {
    const dup = await post("/api/v1/custom-fields", { name: "transferído", type: "BOOLEAN" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CUSTOM_FIELD_NAME_TAKEN");

    const foreign = await post(
      "/api/v1/custom-fields",
      { name: "Mía", type: "TEXT", scope: { accountIds: [checking] } },
      otherCookies,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });

  it("new credit expenses are born 'No'; an income has no value", async () => {
    for (const amount of ["2000", "3000"]) {
      const created = await creditExpense(amount);
      expect(created.customFields).toEqual({ [fieldId]: false });
      expenses.push(created.id);
    }
    const inc = await post("/api/v1/transactions", {
      type: "INCOME",
      amount: "500",
      currency: "CLP",
      occurredAt: "2026-10-02T12:00:00.000Z",
      bankAccountId: checking,
    });
    expect(inc.body.customFields).toEqual({});
    income = inc.body.id;
  });

  it("filters and sums by the field; 'no value' stays within its scope", async () => {
    const pending = await summary(`cf=${fieldId}&cfv=false`);
    expect(pending.total).toBe(3);
    expect(pending.currencyTotals).toEqual([{ currency: "CLP", income: "0", expense: "6000" }]);
    const list = await api()
      .get(`/api/v1/transactions?cf=${fieldId}&cfv=false&limit=2`)
      .set("Cookie", cookies);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.nextCursor).toBeTypeOf("string");
    expect((await summary(`cf=${fieldId}&cfEmpty=true`)).total).toBe(0);

    const bad = await api().get(`/api/v1/transactions?cf=${fieldId}`).set("Cookie", cookies);
    expect(bad.body.error.code).toBe("CUSTOM_FIELD_FILTER_INVALID");
  });

  it("edits one movement's value; refuses a field that doesn't apply", async () => {
    const res = await api()
      .patch(`/api/v1/transactions/${expenses[0]}/custom-fields`)
      .set("Cookie", cookies)
      .send({ values: { [fieldId]: null } });
    expect(res.status).toBe(200);
    expect(res.body.customFields).toEqual({});
    expect((await summary(`cf=${fieldId}&cfEmpty=true`)).total).toBe(1);

    const notApplicable = await api()
      .patch(`/api/v1/transactions/${income}/custom-fields`)
      .set("Cookie", cookies)
      .send({ values: { [fieldId]: true } });
    expect(notApplicable.body.error.code).toBe("CUSTOM_FIELD_NOT_APPLICABLE");

    const foreign = await api()
      .patch(`/api/v1/transactions/${expenses[0]}/custom-fields`)
      .set("Cookie", otherCookies)
      .send({ values: { [fieldId]: true } });
    expect(foreign.status).toBe(404);
  });

  it("previews, assigns in bulk (replay-safe) and undoes", async () => {
    const target = { filter: { cf: fieldId, cfv: "false" } };
    const preview = await api()
      .post(`/api/v1/custom-fields/${fieldId}/assignments/preview`)
      .set("Cookie", cookies)
      .send({ target: { ids: [...expenses, income] }, value: true });
    expect(preview.body).toEqual({ inScope: 3, outOfScope: 1, withOtherValue: 2 });

    const key = randomUUID();
    const assign = () =>
      api()
        .post(`/api/v1/custom-fields/${fieldId}/assignments`)
        .set("Cookie", cookies)
        .set("Idempotency-Key", key)
        .send({ target, value: true });
    const first = await assign();
    expect(first.status).toBe(200);
    expect(first.body.changed).toBe(2);
    const replay = await assign();
    expect(replay.body).toEqual(first.body);
    expect((await summary(`cf=${fieldId}&cfv=true`)).total).toBe(2);

    const undo = await api()
      .post(`/api/v1/custom-fields/${fieldId}/assignments/revert`)
      .set("Cookie", cookies)
      .send({ appliedValue: true, restore: first.body.previous });
    expect(undo.body).toEqual({ restored: 2, kept: 0 });
    expect((await summary(`cf=${fieldId}&cfv=false`)).total).toBe(2);

    // "Todos los del filtro" less one unticked afterwards: the filter minus `exceptIds`.
    const pending = await api()
      .get(`/api/v1/transactions?cf=${fieldId}&cfv=false`)
      .set("Cookie", cookies);
    const [unticked] = (pending.body.items as { id: string }[]).map((t) => t.id);
    const except = await api()
      .post(`/api/v1/custom-fields/${fieldId}/assignments/preview`)
      .set("Cookie", cookies)
      .send({ target: { ...target, exceptIds: [unticked] }, value: true });
    expect(except.body).toEqual({ inScope: 1, outOfScope: 0, withOtherValue: 1 });

    // `inScopeOf`: every movement the field applies to = those with a value + those without.
    const inScope = (await summary(`inScopeOf=${fieldId}`)).total;
    const withValue = (await summary(`cf=${fieldId}&cfHasValue=true`)).total;
    const empty = (await summary(`cf=${fieldId}&cfEmpty=true`)).total;
    expect(inScope).toBe(withValue + empty);
    expect(inScope).toBeLessThan((await summary("")).total);
  });

  it("summarises the field by value", async () => {
    const res = await api()
      .get(`/api/v1/transactions/summary/by-field/${fieldId}`)
      .set("Cookie", cookies);
    const byKey = Object.fromEntries(
      (res.body.buckets as { key: string; total: number }[]).map((b) => [b.key, b.total]),
    );
    expect(byKey).toEqual({ true: 0, false: 2, empty: 1 });
  });

  it("'Transferir pendientes' transfers the sum once and is undone by deleting it", async () => {
    const key = randomUUID();
    const cover = () =>
      api()
        .post("/api/v1/transactions/transfers/cover")
        .set("Cookie", cookies)
        .set("Idempotency-Key", key)
        .send({
          fieldId,
          target: { filter: { cf: fieldId, cfv: "false" } },
          value: true,
          fromBankAccountId: checking,
          toBankAccountId: savings,
        });
    const first = await cover();
    expect(first.status).toBe(201);
    expect(first.body.covered).toBe(2);
    expect(first.body.transfer.outgoing.amount).toBe("5000.0000");
    expect((await cover()).body).toEqual(first.body);
    expect(await balanceOf(savings)).toBe("5000.0000");
    expect((await summary(`cf=${fieldId}&cfv=false`)).total).toBe(0);

    const groupId = first.body.transfer.transferGroupId as string;
    const transfer = await api()
      .get(`/api/v1/transactions/transfers/${groupId}`)
      .set("Cookie", cookies);
    expect(transfer.body.coveredCount).toBe(2);

    const removed = await api()
      .delete(`/api/v1/transactions/transfers/${groupId}`)
      .set("Cookie", cookies);
    expect(removed.status).toBeLessThan(300);
    expect(await balanceOf(savings)).toBe("0.0000");
    expect((await summary(`cf=${fieldId}&cfv=false`)).total).toBe(2);
  });

  it("refuses to cover a mixed selection", async () => {
    const res = await post("/api/v1/transactions/transfers/cover", {
      fieldId,
      target: { ids: [expenses[1], income] },
      value: true,
      fromBankAccountId: checking,
      toBankAccountId: savings,
    });
    expect(res.body.error.code).toBe("COVER_SELECTION_INVALID");
  });

  it("two covers racing over the same movements make one transfer", async () => {
    const cover = () =>
      post("/api/v1/transactions/transfers/cover", {
        fieldId,
        target: { filter: { cf: fieldId, cfv: "false" } },
        value: true,
        fromBankAccountId: checking,
        toBankAccountId: savings,
      });
    const results = await Promise.all([cover(), cover()]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.find((r) => r.status !== 201)?.body.error.code).toMatch(
      /COVER_SELECTION_(CHANGED|INVALID)/,
    );
    expect(await balanceOf(savings)).toBe("5000.0000");
  });

  it("SC-003: assigning 500 movements in bulk takes under 5 s", async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { email: emails[0] } });
    await prisma.transaction.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        userId: user.id,
        bankAccountId: creditAccount,
        cardId: creditCard,
        type: "EXPENSE" as const,
        amount: "10",
        currency: "CLP",
        occurredAt: new Date(Date.UTC(2025, 0, 1, 0, 0, i)),
        description: "bulk",
      })),
    });
    const started = Date.now();
    const res = await api()
      .post(`/api/v1/custom-fields/${fieldId}/assignments`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ target: { filter: { cf: fieldId, cfEmpty: "true" } }, value: true });
    const elapsed = Date.now() - started;
    expect(res.status).toBe(200);
    expect(res.body.changed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(5000);
  });

  it("locks the type once used, and deleting the field erases its values", async () => {
    const locked = await api()
      .patch(`/api/v1/custom-fields/${fieldId}`)
      .set("Cookie", cookies)
      .send({ type: "TEXT" });
    expect(locked.body.error.code).toBe("CUSTOM_FIELD_TYPE_LOCKED");
    const renamed = await api()
      .patch(`/api/v1/custom-fields/${fieldId}`)
      .set("Cookie", cookies)
      .send({ name: "Pasado a MACH" });
    expect(renamed.body.name).toBe("Pasado a MACH");

    expect((await api().get("/api/v1/custom-fields").set("Cookie", otherCookies)).body).toEqual([]);
    const removed = await api().delete(`/api/v1/custom-fields/${fieldId}`).set("Cookie", cookies);
    expect(removed.status).toBe(204);
    expect(await valueOf(expenses[1]!)).toBeUndefined();
  });
});
