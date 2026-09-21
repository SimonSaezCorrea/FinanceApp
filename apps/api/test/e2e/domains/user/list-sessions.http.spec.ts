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
 * E2E (specs/023, US1): logging in from "two browsers" (two separate login calls, each
 * with its own cookie jar) creates two real sessions, and each browser's own
 * `GET /auth/sessions` marks a different row as `isCurrent`.
 */
describe("List sessions HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_list_sessions_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "List Sessions E2E", sensitiveDataConsent: true });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("shows one session for a single login, marked as the current device", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const cookies = login.get("Set-Cookie") ?? [];

    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/sessions")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    // The registration call itself already created one session — logging in adds a second.
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.some((s: { isCurrent: boolean }) => s.isCurrent)).toBe(true);
  });

  it("two separate logins each see both sessions, but mark a different one as current", async () => {
    const loginA = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const cookiesA = loginA.get("Set-Cookie") ?? [];

    const loginB = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const cookiesB = loginB.get("Set-Cookie") ?? [];

    const resA = await request(app.getHttpServer())
      .get("/api/v1/auth/sessions")
      .set("Cookie", cookiesA);
    const resB = await request(app.getHttpServer())
      .get("/api/v1/auth/sessions")
      .set("Cookie", cookiesB);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.body.length).toBe(resB.body.length);

    const currentIdA = resA.body.find((s: { isCurrent: boolean }) => s.isCurrent)?.id;
    const currentIdB = resB.body.find((s: { isCurrent: boolean }) => s.isCurrent)?.id;
    expect(currentIdA).toBeDefined();
    expect(currentIdB).toBeDefined();
    expect(currentIdA).not.toBe(currentIdB);
  });
});
