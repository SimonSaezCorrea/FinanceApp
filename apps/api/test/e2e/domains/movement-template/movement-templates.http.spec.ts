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
 * Movement templates over HTTP (specs/037): CRUD, unique name, the per-person limit,
 * ownership of every reference (account, card on that account, series, custom field),
 * isolation between people, and a deleted card/account degrading the template instead
 * of blocking. Requires a reachable, catalogue-seeded Postgres.
 */
describe("Movement templates HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails = [`e2e_${randomUUID()}@test.local`, `e2e_${randomUUID()}@test.local`];
  let cookies: string[] = [];
  let otherCookies: string[] = [];
  let checking = "";
  let debitCard = "";
  let otherChecking = "";
  let otherCard = "";
  let series = "";
  let fieldId = "";
  let transport = "";
  let salary = "";

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

  async function accountWithDebit(c: string[]) {
    const res = await post(
      "/api/v1/accounts",
      {
        name: "Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "12345",
        accountAlias: null,
        initialBalance: "100000",
        cards: [
          { name: "Débito", kind: "DEBIT", last4: "1111", expiryMonth: 12, expiryYear: 2030 },
        ],
      },
      c,
    );
    expect(res.status).toBe(201);
    return { account: res.body.id as string, card: res.body.cards[0].id as string };
  }

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
    ({ account: checking, card: debitCard } = await accountWithDebit(cookies));
    ({ account: otherChecking, card: otherCard } = await accountWithDebit(otherCookies));
    const second = await post("/api/v1/accounts", {
      name: "Vista",
      type: "SIGHT",
      currency: "CLP",
      accountNumber: "999",
      accountAlias: null,
      initialBalance: "0",
    });
    expect(second.status).toBe(201);
    const rec = await post("/api/v1/recurring", {
      label: "Arriendo",
      amount: "450000",
      currency: "CLP",
      frequency: "MONTHLY",
      anchorDate: "2026-10-01T12:00:00.000Z",
      bankAccountId: checking,
    });
    expect(rec.status).toBe(201);
    series = rec.body.id;
    const field = await post("/api/v1/custom-fields", { name: "Transferido", type: "BOOLEAN" });
    expect(field.status).toBe(201);
    fieldId = field.body.id;
    transport = await categoryIdFor(prisma, "TRANSPORT");
    salary = await categoryIdFor(prisma, "SALARY");
  });

  afterAll(async () => {
    for (const email of emails) {
      await prisma.transaction.deleteMany({ where: { user: { email } } });
      await prisma.bankAccount.deleteMany({ where: { user: { email } } });
      await prisma.user.deleteMany({ where: { email } });
    }
    await app.close();
  });

  let templateId = "";

  it("creates a template with every reference and lists it by name", async () => {
    const res = await post("/api/v1/movement-templates", {
      name: "Bencina",
      type: "EXPENSE",
      bankAccountId: checking,
      cardId: debitCard,
      categoryId: transport,
      recurringExpenseId: series,
      description: "Bencina",
      lugar: "Copec",
      customFields: { [fieldId]: false },
    });
    expect(res.status).toBe(201);
    templateId = res.body.id;
    expect(res.body).toMatchObject({
      name: "Bencina",
      amount: null,
      cardId: debitCard,
      lugar: "Copec",
      customFields: { [fieldId]: false },
    });
    const fixed = await post("/api/v1/movement-templates", {
      name: "Arriendo mensual",
      type: "EXPENSE",
      amount: "450000",
      currency: "CLP",
      bankAccountId: checking,
    });
    expect(fixed.status).toBe(201);
    const list = await api().get("/api/v1/movement-templates").set("Cookie", cookies);
    expect(list.status).toBe(200);
    expect(list.body.map((t: { name: string }) => t.name)).toEqual(["Arriendo mensual", "Bencina"]);
    expect(Number(list.body[0].amount)).toBe(450000);
  });

  it("refuses a duplicate name and invalid references", async () => {
    const dup = await post("/api/v1/movement-templates", { name: " BENCINA ", type: "INCOME" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("MOVEMENT_TEMPLATE_NAME_TAKEN");

    const foreignAccount = await post("/api/v1/movement-templates", {
      name: "X1",
      type: "EXPENSE",
      bankAccountId: otherChecking,
    });
    expect(foreignAccount.status).toBe(404);
    expect(foreignAccount.body.error.code).toBe("ACCOUNT_NOT_FOUND");

    const foreignCard = await post("/api/v1/movement-templates", {
      name: "X2",
      type: "EXPENSE",
      bankAccountId: checking,
      cardId: otherCard,
    });
    expect(foreignCard.status).toBe(404);
    expect(foreignCard.body.error.code).toBe("CARD_NOT_FOUND");

    const wrongCategory = await post("/api/v1/movement-templates", {
      name: "X3",
      type: "EXPENSE",
      categoryId: salary,
    });
    expect(wrongCategory.status).toBe(400);
    expect(wrongCategory.body.error.code).toBe("CATEGORY_NOT_ALLOWED");

    const badValue = await post("/api/v1/movement-templates", {
      name: "X4",
      type: "EXPENSE",
      customFields: { [fieldId]: "quizás" },
    });
    expect(badValue.status).toBe(400);
    expect(badValue.body.error.code).toBe("CUSTOM_FIELD_INVALID_VALUE");

    const noCurrency = await post("/api/v1/movement-templates", {
      name: "X5",
      type: "EXPENSE",
      amount: "10",
    });
    expect(noCurrency.status).toBe(400);
  });

  it("is invisible to another person", async () => {
    const list = await api().get("/api/v1/movement-templates").set("Cookie", otherCookies);
    expect(list.body).toEqual([]);
    const put = await api()
      .put(`/api/v1/movement-templates/${templateId}`)
      .set("Cookie", otherCookies)
      .send({ name: "Mío", type: "EXPENSE" });
    expect(put.status).toBe(404);
    expect(put.body.error.code).toBe("MOVEMENT_TEMPLATE_NOT_FOUND");
    const del = await api()
      .delete(`/api/v1/movement-templates/${templateId}`)
      .set("Cookie", otherCookies);
    expect(del.status).toBe(404);
  });

  it("replaces a template's whole state", async () => {
    const res = await api()
      .put(`/api/v1/movement-templates/${templateId}`)
      .set("Cookie", cookies)
      .send({ name: "Bencina", type: "EXPENSE", bankAccountId: checking, cardId: debitCard });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      categoryId: null,
      recurringExpenseId: null,
      customFields: {},
    });
  });

  it("degrades instead of blocking when its card, series and field are deleted", async () => {
    await api()
      .put(`/api/v1/movement-templates/${templateId}`)
      .set("Cookie", cookies)
      .send({
        name: "Bencina",
        type: "EXPENSE",
        bankAccountId: checking,
        cardId: debitCard,
        recurringExpenseId: series,
        customFields: { [fieldId]: true },
      })
      .expect(200);
    await api()
      .delete(`/api/v1/accounts/${checking}/cards/${debitCard}`)
      .set("Cookie", cookies)
      .expect((r) => expect(r.status).toBeLessThan(300));
    await api()
      .delete(`/api/v1/recurring/${series}`)
      .set("Cookie", cookies)
      .expect((r) => expect(r.status).toBeLessThan(300));
    await api().delete(`/api/v1/custom-fields/${fieldId}`).set("Cookie", cookies).expect(204);
    const list = await api().get("/api/v1/movement-templates").set("Cookie", cookies);
    const t = list.body.find((x: { id: string }) => x.id === templateId);
    expect(t).toMatchObject({
      bankAccountId: checking,
      cardId: null,
      recurringExpenseId: null,
      customFields: {},
    });
  });

  it("deletes, then answers 404 on a replay", async () => {
    await api()
      .delete(`/api/v1/movement-templates/${templateId}`)
      .set("Cookie", cookies)
      .expect(204);
    const again = await api()
      .delete(`/api/v1/movement-templates/${templateId}`)
      .set("Cookie", cookies);
    expect(again.status).toBe(404);
  });

  it("refuses the 51st template", async () => {
    const existing = await prisma.movementTemplate.count({
      where: { user: { email: emails[0]! } },
    });
    const user = await prisma.user.findFirstOrThrow({ where: { email: emails[0]! } });
    await prisma.movementTemplate.createMany({
      data: Array.from({ length: 50 - existing }, (_, i) => ({
        userId: user.id,
        name: `Relleno ${i}`,
        nameKey: `relleno ${i}`,
        type: "EXPENSE" as const,
      })),
    });
    const res = await post("/api/v1/movement-templates", { name: "Una más", type: "EXPENSE" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MOVEMENT_TEMPLATE_LIMIT_REACHED");
  });
});
