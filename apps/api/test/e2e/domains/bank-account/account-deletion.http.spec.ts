import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

function rut(): string {
  const b = String(Math.floor(1e6 + Math.random() * 24e6));
  let s = 0;
  let m = 2;
  for (let i = b.length - 1; i >= 0; i--) {
    s += Number(b[i]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const r = 11 - (s % 11);
  return `${b}-${r === 11 ? "0" : r === 10 ? "K" : String(r)}`;
}

/**
 * Deleting an account with the related data the user chose: the impact is
 * declared first, and every other account a deleted movement touched gets its
 * money back in the same step.
 */
describe("Account deletion HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_${randomUUID()}@test.local`;
  let cookies: string[] = [];
  const api = () => request(app.getHttpServer());

  async function account(name: string, initialBalance = "0"): Promise<string> {
    const res = await api()
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name,
        type: "CHECKING",
        currency: "CLP",
        accountNumber: String(Math.floor(Math.random() * 1e10)),
        initialBalance,
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function transfer(from: string, to: string, amount: string): Promise<void> {
    const res = await api()
      .post("/api/v1/transactions/transfers")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        fromBankAccountId: from,
        toBankAccountId: to,
        amountOut: amount,
        amountIn: amount,
        currencyOut: "CLP",
        currencyIn: "CLP",
        occurredAt: new Date().toISOString(),
        description: "Traspaso",
      });
    expect(res.status).toBe(201);
  }

  const balanceOf = async (id: string) =>
    (await api().get(`/api/v1/accounts/${id}`).set("Cookie", cookies)).body.currentBalance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    const res = await api().post("/api/v1/auth/register").send({
      email,
      password: "Sup3rSecret!",
      name: "E2E User",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut(),
    });
    cookies = res.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("declares the impact, then deletes the movements and restores the other account", async () => {
    const source = await account("Origen", "200000");
    const target = await account("Destino");
    await transfer(source, target, "50000");
    expect(await balanceOf(source)).toBe("150000.0000");

    const impact = await api()
      .get(`/api/v1/accounts/${target}/deletion-impact`)
      .set("Cookie", cookies);
    expect(impact.status).toBe(200);
    expect(impact.body.movements).toMatchObject({ count: 1, transfers: 1 });
    expect(impact.body.movements.restorations).toEqual([
      { accountId: source, amount: "50000.0000", currency: "CLP" },
    ]);

    const del = await api()
      .delete(`/api/v1/accounts/${target}`)
      .set("Cookie", cookies)
      .send({ movements: true });
    expect(del.status).toBe(204);

    // Both legs are gone and the source has its 50.000 back.
    expect(await balanceOf(source)).toBe("200000.0000");
    const left = await prisma.transaction.count({ where: { user: { email } } });
    expect(left).toBe(0);
  });

  it("without options keeps the old behaviour: only the account goes", async () => {
    const source = await account("Origen 2", "100000");
    const target = await account("Destino 2");
    await transfer(source, target, "30000");

    const del = await api().delete(`/api/v1/accounts/${target}`).set("Cookie", cookies);
    expect(del.status).toBe(204);

    expect(await balanceOf(source)).toBe("70000.0000");
    const orphans = await prisma.transaction.count({
      where: { user: { email }, bankAccountId: null },
    });
    expect(orphans).toBe(1);
  });
});
