import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/** Full transfer flow over HTTP: create → see both sides → edit → delete, plus
 *  every rejection the policy owes. Requires a reachable Postgres. */
describe("Transfers HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_${randomUUID()}@test.local`;
  let cookies: string[] = [];
  let origen = "";
  let destino = "";
  let otro = "";
  let creditLine = "";
  let groupId = "";

  const api = () => request(app.getHttpServer());

  async function createAccount(name: string, initialBalance: string) {
    const res = await api().post("/api/v1/accounts").set("Cookie", cookies).send({
      name,
      type: "CHECKING",
      currency: "CLP",
      accountNumber: "12345",
      initialBalance,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  const balanceOf = async (id: string) => {
    const res = await api().get(`/api/v1/accounts/${id}`).set("Cookie", cookies);
    return res.body.currentBalance as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registerRes = await api()
      .post("/api/v1/auth/register")
      .send({ email, password: "Sup3rSecret!", name: "E2E User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    origen = await createAccount("Origen", "10000");
    destino = await createAccount("Destino", "0");
    otro = await createAccount("Otro", "0");

    const credit = await api()
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Linea",
        type: "CREDIT_LINE",
        currency: "CLP",
        creditLimit: "500000",
        cards: [
          {
            name: "Card",
            kind: "CREDIT",
            last4: "1234",
            expiryMonth: 12,
            expiryYear: 2030,
            limits: [{ currency: "CLP", limitAmount: "500000" }],
          },
        ],
      });
    creditLine = credit.body.id as string;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.creditStatement.deleteMany({ where: { account: { user: { email } } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const body = () => ({
    fromBankAccountId: origen,
    toBankAccountId: destino,
    amountOut: "1000",
    amountIn: "1000",
    currencyOut: "CLP",
    currencyIn: "CLP",
    occurredAt: "2026-08-01T00:00:00.000Z",
    description: "Ahorro del mes",
  });

  it("creates a transfer and moves both balances", async () => {
    const res = await api()
      .post("/api/v1/transactions/transfers")
      .set("Cookie", cookies)
      .send(body());
    expect(res.status).toBe(201);
    groupId = res.body.transferGroupId;
    expect(res.body.outgoing.type).toBe("EXPENSE");
    expect(res.body.incoming.type).toBe("INCOME");
    expect(res.body.outgoing.cardId).toBeNull();

    expect(await balanceOf(origen)).toBe("9000.0000");
    expect(await balanceOf(destino)).toBe("1000.0000");
  });

  it("shows one leg in each account's own movement list", async () => {
    const out = await api()
      .get(`/api/v1/transactions?bankAccountId=${origen}`)
      .set("Cookie", cookies);
    const inn = await api()
      .get(`/api/v1/transactions?bankAccountId=${destino}`)
      .set("Cookie", cookies);
    expect(out.body.items).toHaveLength(1);
    expect(inn.body.items).toHaveLength(1);
    expect(out.body.items[0].transferGroupId).toBe(groupId);
  });

  it("keeps transfers out of the summary totals but counts them as movements", async () => {
    const res = await api().get("/api/v1/transactions/summary").set("Cookie", cookies);
    expect(res.body.total).toBe(2);
    expect(res.body.currencyTotals).toEqual([]);
  });

  it("reads the pair from either side", async () => {
    const res = await api().get(`/api/v1/transactions/transfers/${groupId}`).set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.outgoing.bankAccountId).toBe(origen);
  });

  it("refuses to edit one leg alone", async () => {
    const pair = await api()
      .get(`/api/v1/transactions/transfers/${groupId}`)
      .set("Cookie", cookies);
    const res = await api()
      .patch(`/api/v1/transactions/${pair.body.outgoing.id}`)
      .set("Cookie", cookies)
      .send({ amount: "5000" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TRANSFER_EDIT_AS_PAIR");
  });

  it("edits the pair, moving the destination to a third account", async () => {
    const res = await api()
      .patch(`/api/v1/transactions/transfers/${groupId}`)
      .set("Cookie", cookies)
      .send({ toBankAccountId: otro, amountOut: "2000", amountIn: "2000" });
    expect(res.status).toBe(200);

    expect(await balanceOf(origen)).toBe("8000.0000");
    expect(await balanceOf(destino)).toBe("0.0000");
    expect(await balanceOf(otro)).toBe("2000.0000");
  });

  it("deletes the whole pair from one leg", async () => {
    const pair = await api()
      .get(`/api/v1/transactions/transfers/${groupId}`)
      .set("Cookie", cookies);
    const res = await api()
      .delete(`/api/v1/transactions/${pair.body.incoming.id}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);

    expect(await balanceOf(origen)).toBe("10000.0000");
    expect(await balanceOf(otro)).toBe("0.0000");
    const list = await api().get("/api/v1/transactions").set("Cookie", cookies);
    expect(list.body.items).toHaveLength(0);
  });

  it("rejects what the policy forbids", async () => {
    const post = (over: Record<string, unknown>) =>
      api()
        .post("/api/v1/transactions/transfers")
        .set("Cookie", cookies)
        .send({ ...body(), ...over });

    // Same account on both sides — caught by the contract's own refine.
    expect((await post({ toBankAccountId: origen })).status).toBe(400);
    // Destination is a credit line.
    const credit = await post({ toBankAccountId: creditLine });
    expect(credit.status).toBe(400);
    expect(credit.body.error.code).toBe("TRANSFER_TO_CREDIT_ACCOUNT");
    // An account that isn't the user's.
    const foreign = await post({ toBankAccountId: "not-mine" });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("TRANSFER_ACCOUNT_NOT_FOUND");
    // Non-positive amount.
    expect((await post({ amountOut: "0" })).status).toBe(400);
    // An unknown group.
    expect(
      (await api().get("/api/v1/transactions/transfers/nope").set("Cookie", cookies)).status,
    ).toBe(404);
  });
});
