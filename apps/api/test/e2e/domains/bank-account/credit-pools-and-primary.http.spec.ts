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

type Card = { id: string; isPrimary: boolean; isActive: boolean; last4: string };
type Pool = { currency: string; limit: string; used: string };

/**
 * Spec 039 through the real HTTP surface: the credit in each currency is the ACCOUNT's, an
 * additional card may carry sub-limits within it, and the primary card is changed — never
 * deactivated or deleted without naming the card that takes its place. Requires a reachable,
 * seeded test database.
 */
describe("Credit lines and the primary card (e2e, spec 039)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_${randomUUID()}@test.local`;
  let cookies: string[] = [];
  const api = () => request(app.getHttpServer());

  const cardInput = (last4: string, extra: Record<string, unknown> = {}) => ({
    name: `Visa ${last4}`,
    kind: "CREDIT",
    last4,
    expiryMonth: 6,
    expiryYear: 2031,
    ...extra,
  });

  async function creditAccount(extraCards: Record<string, unknown>[] = []) {
    const res = await api()
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: `Visa ${randomUUID().slice(0, 6)}`,
        type: "CREDIT_CARD",
        currency: "CLP",
        creditLimit: "2000000",
        extraCreditLimits: [{ currency: "USD", limitAmount: "3000" }],
        cards: [
          cardInput("1111", { limits: [{ currency: "CLP", limitAmount: "2000000" }] }),
          ...extraCards,
        ],
      });
    expect(res.status).toBe(201);
    return res.body as { id: string; cards: Card[]; creditPools: Pool[] };
  }

  const getAccount = async (id: string) =>
    (await api().get(`/api/v1/accounts/${id}`).set("Cookie", cookies)).body as {
      creditLimit: string;
      creditUsed: string;
      cards: Card[];
      creditPools: Pool[];
    };

  const usdPool = (account: { creditPools: Pool[] }) =>
    account.creditPools.find((p) => p.currency === "USD");

  const charge = (accountId: string, cardId: string, amount: string, currency = "USD") =>
    api()
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        type: "EXPENSE",
        amount,
        currency,
        occurredAt: new Date().toISOString(),
        bankAccountId: accountId,
        cardId,
        description: "Compra",
      });

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
      identifierValue: randomValidRut(),
    });
    cookies = res.get("Set-Cookie") ?? [];
    // CLF has no credit line on these accounts: the profile must allow it to be typed at all.
    await api()
      .patch("/api/v1/auth/me/preferences")
      .set("Cookie", cookies)
      .send({ extraCurrencies: ["USD", "CLF"] });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  describe("US1 — the account's credit in each currency", () => {
    it("every card spends the account's USD credit; the pesos pool doesn't move", async () => {
      const account = await creditAccount([cardInput("2222")]);
      const additional = account.cards.find((c) => !c.isPrimary)!;
      expect(usdPool(account)).toMatchObject({ limit: "3000.0000", used: "0.0000" });

      expect((await charge(account.id, additional.id, "1000")).status).toBe(201);

      const after = await getAccount(account.id);
      expect(usdPool(after)?.used).toBe("1000.0000");
      expect(after.creditUsed).toBe("0.0000");
    });

    it("refuses a charge past the USD credit, and one in a currency without credit", async () => {
      const account = await creditAccount();
      const primary = account.cards[0]!;
      const over = await charge(account.id, primary.id, "3000.01");
      expect(over.status).toBe(400);
      expect(over.body.error.code).toBe("CARD_LIMIT_EXCEEDED");
      const clf = await charge(account.id, primary.id, "5", "CLF");
      expect(clf.status).toBe(400);
      expect(clf.body.error.code).toBe("CREDIT_POOL_CURRENCY_NOT_FOUND");
    });

    it("won't remove a line that still owes something, and removes one that doesn't", async () => {
      const account = await creditAccount();
      await charge(account.id, account.cards[0]!.id, "10");
      const busy = await api()
        .patch(`/api/v1/accounts/${account.id}`)
        .set("Cookie", cookies)
        .send({ extraCreditLimits: [] });
      expect(busy.status).toBe(409);
      expect(busy.body.error.code).toBe("CREDIT_POOL_IN_USE");

      const empty = await creditAccount();
      const removed = await api()
        .patch(`/api/v1/accounts/${empty.id}`)
        .set("Cookie", cookies)
        .send({ extraCreditLimits: [] });
      expect(removed.status).toBe(200);
      expect(usdPool(removed.body)).toBeUndefined();
    });

    it("a client older than spec 039 still sets the USD credit through the primary card", async () => {
      const account = await creditAccount();
      const primary = account.cards[0]!;
      const res = await api()
        .patch(`/api/v1/accounts/${account.id}/cards/${primary.id}`)
        .set("Cookie", cookies)
        .send(
          cardInput("1111", {
            limits: [
              { currency: "CLP", limitAmount: "2000000" },
              { currency: "USD", limitAmount: "4500" },
            ],
          }),
        );
      expect(res.status).toBe(200);
      expect(usdPool(await getAccount(account.id))?.limit).toBe("4500.0000");
    });
  });

  describe("US2 — sub-limits of additional cards", () => {
    it("caps the card by its sub-limit while still spending the account's credit", async () => {
      const account = await creditAccount([
        cardInput("2222", {
          usesAccountPool: false,
          limits: [{ currency: "USD", limitAmount: "500" }],
        }),
      ]);
      const additional = account.cards.find((c) => !c.isPrimary)!;
      expect((await charge(account.id, additional.id, "400")).status).toBe(201);
      const over = await charge(account.id, additional.id, "200");
      expect(over.status).toBe(400);
      expect(over.body.error.code).toBe("CARD_SUBLIMIT_EXCEEDED");
      expect(usdPool(await getAccount(account.id))?.used).toBe("400.0000");
    });

    it("refuses a sub-limit above the account's credit or in a currency without credit", async () => {
      const account = await creditAccount();
      for (const [limit, code] of [
        [{ currency: "USD", limitAmount: "4000" }, "CARD_SUBLIMIT_EXCEEDS_ACCOUNT"],
        [{ currency: "CLF", limitAmount: "10" }, "CREDIT_POOL_CURRENCY_NOT_FOUND"],
      ] as const) {
        const res = await api()
          .post(`/api/v1/accounts/${account.id}/cards`)
          .set("Cookie", cookies)
          .send(cardInput("3333", { usesAccountPool: false, limits: [limit] }));
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe(code);
      }
    });
  });

  describe("US3 — deactivating the primary names its replacement", () => {
    const replace = (accountId: string, cardId: string, body: object, key = randomUUID()) =>
      api()
        .post(`/api/v1/accounts/${accountId}/cards/${cardId}/replace-primary`)
        .set("Cookie", cookies)
        .set("Idempotency-Key", key)
        .send(body);

    it("refuses a plain deactivation or delete of the primary", async () => {
      const account = await creditAccount();
      const primary = account.cards[0]!;
      const patch = await api()
        .patch(`/api/v1/accounts/${account.id}/cards/${primary.id}`)
        .set("Cookie", cookies)
        .send(cardInput("1111", { isActive: false }));
      expect(patch.status).toBe(409);
      expect(patch.body.error.code).toBe("PRIMARY_CARD_REPLACEMENT_REQUIRED");
      const del = await api()
        .delete(`/api/v1/accounts/${account.id}/cards/${primary.id}`)
        .set("Cookie", cookies);
      expect(del.status).toBe(409);
    });

    it("needs an Idempotency-Key", async () => {
      const account = await creditAccount();
      const res = await api()
        .post(`/api/v1/accounts/${account.id}/cards/${account.cards[0]!.id}/replace-primary`)
        .set("Cookie", cookies)
        .send({ action: "DEACTIVATE", replacement: { newCard: cardInput("9999") } });
      expect(res.status).toBe(400);
    });

    it("replaces the plastic with a new card: one card, credit unchanged, billing works", async () => {
      const account = await creditAccount();
      const old = account.cards[0]!;
      await charge(account.id, old.id, "25");
      const before = await getAccount(account.id);
      const key = randomUUID();
      const body = { action: "DEACTIVATE", replacement: { newCard: cardInput("9999") } };

      const res = await replace(account.id, old.id, body, key);
      expect(res.status).toBe(200);
      const replay = await replace(account.id, old.id, body, key);
      expect(replay.status).toBe(200);

      const after = await getAccount(account.id);
      expect(after.cards).toHaveLength(2);
      const fresh = after.cards.find((c) => c.last4 === "9999")!;
      expect(fresh).toMatchObject({ isPrimary: true, isActive: true });
      expect(after.cards.find((c) => c.id === old.id)).toMatchObject({
        isPrimary: false,
        isActive: false,
      });
      expect(after.creditLimit).toBe(before.creditLimit);
      expect(after.creditPools).toEqual(before.creditPools);

      // The movement made with the old plastic keeps it.
      const moves = await prisma.transaction.findMany({ where: { bankAccountId: account.id } });
      expect(moves.every((m) => m.cardId === old.id)).toBe(true);

      const generated = await api()
        .post(`/api/v1/accounts/${account.id}/generate-statements`)
        .set("Cookie", cookies)
        .send({
          periodStart: "2026-01-01T00:00:00.000Z",
          closedAt: new Date(Date.now() + 86_400_000).toISOString(),
          dueDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        });
      expect(generated.status).toBe(201);

      // Reactivating the old one brings it back as an additional card.
      const reactivated = await api()
        .patch(`/api/v1/accounts/${account.id}/cards/${old.id}`)
        .set("Cookie", cookies)
        .send(cardInput("1111", { isActive: true }));
      expect(reactivated.status).toBe(200);
      expect(reactivated.body).toMatchObject({ isActive: true, isPrimary: false });
    });

    it("refuses a card that is no longer the primary", async () => {
      const account = await creditAccount([cardInput("2222")]);
      const [primary, additional] = [
        account.cards.find((c) => c.isPrimary)!,
        account.cards.find((c) => !c.isPrimary)!,
      ];
      await replace(account.id, primary.id, {
        action: "DEACTIVATE",
        replacement: { cardId: additional.id },
      });
      const again = await replace(account.id, primary.id, {
        action: "DEACTIVATE",
        replacement: { cardId: additional.id },
      });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("CARD_NOT_PRIMARY");
    });
  });

  describe("US4 — make primary", () => {
    it("swaps the roles, both stay active, and repeating it changes nothing", async () => {
      const account = await creditAccount([cardInput("2222")]);
      const additional = account.cards.find((c) => !c.isPrimary)!;
      for (let i = 0; i < 2; i++) {
        const res = await api()
          .post(`/api/v1/accounts/${account.id}/cards/${additional.id}/make-primary`)
          .set("Cookie", cookies);
        expect(res.status).toBe(200);
      }
      const after = await getAccount(account.id);
      expect(after.cards.filter((c) => c.isPrimary).map((c) => c.id)).toEqual([additional.id]);
      expect(after.cards.every((c) => c.isActive)).toBe(true);
    });
  });

  describe("US5 — deleting the primary", () => {
    it("deletes a primary without history, and refuses one with movements", async () => {
      const clean = await creditAccount([cardInput("2222")]);
      const cleanAdditional = clean.cards.find((c) => !c.isPrimary)!;
      const ok = await api()
        .post(`/api/v1/accounts/${clean.id}/cards/${clean.cards[0]!.id}/replace-primary`)
        .set("Cookie", cookies)
        .set("Idempotency-Key", randomUUID())
        .send({ action: "DELETE", replacement: { cardId: cleanAdditional.id } });
      expect(ok.status).toBe(200);
      expect((await getAccount(clean.id)).cards.map((c) => c.id)).toEqual([cleanAdditional.id]);

      const used = await creditAccount();
      await charge(used.id, used.cards[0]!.id, "5");
      const refused = await api()
        .post(`/api/v1/accounts/${used.id}/cards/${used.cards[0]!.id}/replace-primary`)
        .set("Cookie", cookies)
        .set("Idempotency-Key", randomUUID())
        .send({ action: "DELETE", replacement: { newCard: cardInput("9999") } });
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe("PRIMARY_CARD_HAS_HISTORY");
    });
  });
});
