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
 * E2E test (mirrors debts'/recurring's pattern): full create/list/get/
 * update/delete HTTP flows for savings goals + entries, through the migrated
 * Facade controller — must behave identically to the pre-migration
 * `SavingsController`/`SavingsService`. Requires a reachable Postgres (real
 * test DB), not part of `test:unit`.
 */
describe("Savings HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_savings_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let goalId: string;

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
      .send({ email, password, name: "E2E Savings User" });
    cookies = registerRes.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.savingsEntry.deleteMany({ where: { user: { email } } });
    await prisma.savingsGoal.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("creates a savings goal", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/savings/goals")
      .set("Cookie", cookies)
      .send({
        title: "Emergency fund",
        targetAmount: "5000",
        currency: "USD",
        deadline: "2026-12-31T00:00:00.000Z",
      });
    expect(res.status).toBe(201);
    goalId = res.body.id;
    expect(res.body.targetAmount).toBe("5000.0000");
  });

  it("lists the user's savings goals", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/savings/goals").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.map((g: { id: string }) => g.id)).toContain(goalId);
  });

  it("gets a single savings goal", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/savings/goals/${goalId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Emergency fund");
  });

  it("returns SAVINGS_GOAL_NOT_FOUND for an unknown id", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/savings/goals/ghost")
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("SAVINGS_GOAL_NOT_FOUND");
  });

  it("updates the savings goal's scalar fields", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/savings/goals/${goalId}`)
      .set("Cookie", cookies)
      .send({ title: "New title", targetAmount: "6000" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New title");
    expect(res.body.targetAmount).toBe("6000.0000");
  });

  it("creates a savings entry linked to the goal", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/savings/entries")
      .set("Cookie", cookies)
      .send({
        savingsGoalId: goalId,
        amount: "250",
        currency: "USD",
        contributedAt: "2026-02-01T00:00:00.000Z",
      });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe("250.0000");
    expect(res.body.savingsGoalId).toBe(goalId);
  });

  it("lists the user's savings entries", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/savings/entries").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.some((e: { savingsGoalId: string }) => e.savingsGoalId === goalId)).toBe(true);
  });

  it("deletes the savings goal", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/savings/goals/${goalId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);
  });

  it("returns SAVINGS_GOAL_NOT_FOUND for a deleted/unknown id", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/savings/goals/${goalId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("SAVINGS_GOAL_NOT_FOUND");
  });
});
