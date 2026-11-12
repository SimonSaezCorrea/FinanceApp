import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../src/app.module";
import { AllExceptionsFilter } from "../../../src/infra/http/all-exceptions.filter";
import { RATE_LIMIT_POLICIES } from "../../../src/infra/http/rate-limit";
import { PrismaService } from "../../../src/infra/prisma/prisma.service";
import { randomValidRut } from "../support/rut";

/**
 * Security run-3: request limits per client. Off outside production, so this file turns them on
 * (`RATE_LIMITS_ENABLED=true`) before the app reads its config.
 */
describe("Request limits (e2e)", { timeout: 30_000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = process.env.RATE_LIMITS_ENABLED;
  const email = `e2e_ratelimit_${randomUUID()}@test.local`;

  beforeAll(async () => {
    process.env.RATE_LIMITS_ENABLED = "true";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
    if (previous === undefined) delete process.env.RATE_LIMITS_ENABLED;
    else process.env.RATE_LIMITS_ENABLED = previous;
  });

  it("one IP gets a fixed number of sign-in attempts, whatever accounts it tries", async () => {
    const { limit } = RATE_LIMIT_POLICIES.authAttempt;
    for (let i = 0; i < limit; i++) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ identifierValue: randomValidRut(), password: "whatever-123" });
      expect(res.status).toBe(401);
    }
    const over = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: randomValidRut(), password: "whatever-123" });
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("RATE_LIMITED");
    expect(over.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(over.get("Retry-After"))).toBeGreaterThan(0);

    // The same policy covers the other ways to try a credential from that IP.
    const reset = await request(app.getHttpServer())
      .post("/api/v1/auth/password/reset")
      .send({ token: "x".repeat(43), newPassword: "N3wSecret!pass" });
    expect(reset.status).toBe(429);
  });

  it("a signed-in user gets a fixed number of imports, then waits", async () => {
    // Sign-up has its own (email) policy, so the attempts above don't block it.
    const reg = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password: "Sup3rSecret!",
      name: "Rate Limit",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    expect(reg.status).toBe(201);
    const cookies = reg.get("Set-Cookie") ?? [];

    const { limit } = RATE_LIMIT_POLICIES.heavyWrite;
    for (let i = 0; i < limit; i++) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/import/template/preview")
        .set("Cookie", cookies)
        .send({});
      expect(res.status).toBe(400); // counted even when the body is refused
    }
    const over = await request(app.getHttpServer())
      .post("/api/v1/import/template/preview")
      .set("Cookie", cookies)
      .send({});
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("RATE_LIMITED");
  });
});
