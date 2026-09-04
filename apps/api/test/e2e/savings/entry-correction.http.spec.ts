import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../src/app.module";
import { AllExceptionsFilter } from "../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../src/infra/prisma/prisma.service";

/**
 * Correction of a savings-entry contribution (US3, quickstart scenarios 11
 * and 12): edit/delete replace what a "delete and redo" pattern would have
 * done, and a foreign entry answers 404 — never 403 (Constitution Principle
 * II: an identifier is not authorization).
 */
describe("Savings entry correction (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailA = `e2e_entry_owner_${randomUUID()}@test.local`;
  const emailB = `e2e_entry_stranger_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookiesA: string[] = [];
  let cookiesB: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registerA = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: emailA, password, name: "E2E Entry Owner" });
    cookiesA = registerA.get("Set-Cookie") ?? [];

    const registerB = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: emailB, password, name: "E2E Entry Stranger" });
    cookiesB = registerB.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.savingsEntry.deleteMany({ where: { user: { email: { in: [emailA, emailB] } } } });
    await prisma.idempotencyRecord.deleteMany({
      where: { user: { email: { in: [emailA, emailB] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await app.close();
  });

  it("scenario 11: PATCH corrects the amount, DELETE removes it, and a second DELETE 404s", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/savings/entries")
      .set("Cookie", cookiesA)
      .set("Idempotency-Key", randomUUID())
      .send({ amount: "200000", currency: "CLP", contributedAt: "2026-09-02T12:00:00.000Z" });
    expect(created.status).toBe(201);
    const entryId = created.body.id;

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/savings/entries/${entryId}`)
      .set("Cookie", cookiesA)
      .send({ amount: "150000" });
    expect(patched.status).toBe(200);
    expect(patched.body.amount).toBe("150000.0000");

    const listAfterPatch = await request(app.getHttpServer())
      .get("/api/v1/savings/entries")
      .set("Cookie", cookiesA);
    expect(listAfterPatch.body.find((e: { id: string }) => e.id === entryId).amount).toBe(
      "150000.0000",
    );

    const removed = await request(app.getHttpServer())
      .delete(`/api/v1/savings/entries/${entryId}`)
      .set("Cookie", cookiesA);
    expect(removed.status).toBe(204);

    const listAfterDelete = await request(app.getHttpServer())
      .get("/api/v1/savings/entries")
      .set("Cookie", cookiesA);
    expect(listAfterDelete.body.some((e: { id: string }) => e.id === entryId)).toBe(false);

    const secondDelete = await request(app.getHttpServer())
      .delete(`/api/v1/savings/entries/${entryId}`)
      .set("Cookie", cookiesA);
    expect(secondDelete.status).toBe(404);
  });

  it("scenario 12: a foreign entry answers 404 on GET, PATCH and DELETE — never 403", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/savings/entries")
      .set("Cookie", cookiesA)
      .set("Idempotency-Key", randomUUID())
      .send({ amount: "50000", currency: "CLP", contributedAt: "2026-09-02T12:00:00.000Z" });
    const entryId = created.body.id;

    const getForeign = await request(app.getHttpServer())
      .get(`/api/v1/savings/entries/${entryId}`)
      .set("Cookie", cookiesB);
    expect(getForeign.status).toBe(404);
    expect(getForeign.body.error.code).toBe("SAVINGS_ENTRY_NOT_FOUND");

    const patchForeign = await request(app.getHttpServer())
      .patch(`/api/v1/savings/entries/${entryId}`)
      .set("Cookie", cookiesB)
      .send({ amount: "1" });
    expect(patchForeign.status).toBe(404);

    const deleteForeign = await request(app.getHttpServer())
      .delete(`/api/v1/savings/entries/${entryId}`)
      .set("Cookie", cookiesB);
    expect(deleteForeign.status).toBe(404);
  });
});
