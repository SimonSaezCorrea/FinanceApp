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
 * E2E test (mirrors debts'/savings' pattern): full add/list/reorder/remove
 * HTTP flows for wallet pins, through the migrated Facade controller — must
 * behave identically to the pre-migration `WalletController`/`WalletService`.
 * Requires a reachable Postgres (real test DB), not part of `test:unit`.
 */
describe("Wallet HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_wallet_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let accountId: string;
  let itemId: string;

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
      .send({ email, password, name: "E2E Wallet User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const accountRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Checking",
        type: "CHECKING",
        currency: "USD",
        accountNumber: "1234",
        accountAlias: null,
        initialBalance: "0",
        overdraftLimit: "0",
      });
    accountId = accountRes.body.id;
  });

  afterAll(async () => {
    await prisma.walletItemDashboard.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("rejects providing neither accountId nor cardId", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/wallet")
      .set("Cookie", cookies)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects providing both accountId and cardId", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/wallet")
      .set("Cookie", cookies)
      .send({ accountId, cardId: randomUUID() });
    expect(res.status).toBe(400);
  });

  it("pins an account", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/wallet")
      .set("Cookie", cookies)
      .send({ accountId });
    expect(res.status).toBe(201);
    itemId = res.body.id;
    expect(res.body.accountId).toBe(accountId);
    expect(res.body.cardId).toBeNull();
  });

  it("rejects a duplicate pin", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/wallet")
      .set("Cookie", cookies)
      .send({ accountId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("WALLET_ITEM_EXISTS");
  });

  it("rejects pinning an account the user doesn't own", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/wallet")
      .set("Cookie", cookies)
      .send({ accountId: randomUUID() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });

  it("lists the user's pins", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/wallet").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.map((i: { id: string }) => i.id)).toContain(itemId);
  });

  it("reorders the pins", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/wallet/reorder")
      .set("Cookie", cookies)
      .send({ ids: [itemId] });
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(itemId);
  });

  it("removes the pin", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/wallet/${itemId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);
  });

  it("returns WALLET_ITEM_NOT_FOUND removing a missing item", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/wallet/${itemId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("WALLET_ITEM_NOT_FOUND");
  });
});
