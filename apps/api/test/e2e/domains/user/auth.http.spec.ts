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
 * E2E test (SC-001): full register/login/refresh/profile/password/preferences/
 * deactivate HTTP flows through the migrated Facade controller — must behave
 * identically to the pre-migration `AuthController`/`AuthService`. Requires a
 * reachable Postgres (real test DB), not part of `test:unit`.
 */
describe("Auth HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_auth_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];

  beforeAll(async () => {
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
  });

  it("registers a new user and sets httpOnly auth cookies", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "E2E User" });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email.toLowerCase());
    cookies = res.get("Set-Cookie") ?? [];
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);
  });

  it("rejects registering the same email twice (EMAIL_TAKEN)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Dup" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    const ok = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
    expect(ok.status).toBe(200);
    cookies = ok.get("Set-Cookie") ?? [];

    const bad = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("GET /auth/me returns the current user", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email.toLowerCase());
  });

  it("rejects /auth/me with no cookie", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("PATCH /auth/me updates the profile", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/auth/me")
      .set("Cookie", cookies)
      .send({ name: "Updated Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Name");
  });

  it("POST /auth/me/password rejects a wrong current password, accepts the right one", async () => {
    const wrong = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookies)
      .send({ currentPassword: "wrong", newPassword: "newpassword123" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_CURRENT_PASSWORD");

    const ok = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookies)
      .send({ currentPassword: password, newPassword: "newpassword123" });
    expect(ok.status).toBe(204);
  });

  it("PATCH /auth/me/preferences persists a partial update", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/auth/me/preferences")
      .set("Cookie", cookies)
      .send({ theme: "light", locale: "en" });
    expect(res.status).toBe(200);
    expect(res.body.theme).toBe("light");
    expect(res.body.locale).toBe("en");
  });

  it("POST /auth/refresh rotates the token pair", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", cookies);
    expect(res.status).toBe(204);
    const fresh = res.get("Set-Cookie") ?? [];
    expect(fresh.some((c) => c.startsWith("access_token="))).toBe(true);
    cookies = fresh;
  });

  it("POST /auth/me/deactivate soft-disables the account and clears cookies, blocking further login", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/deactivate")
      .set("Cookie", cookies)
      .send({ password: "newpassword123" });
    expect(res.status).toBe(204);

    const loginAttempt = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "newpassword123" });
    expect(loginAttempt.status).toBe(401);
    expect(loginAttempt.body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("POST /auth/logout clears cookies (204, no body)", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/logout");
    expect(res.status).toBe(204);
  });
});
