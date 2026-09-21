import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/** E2E (specs/024): changing the password from one of several active logins revokes
 * every other one immediately, while the acting session keeps working throughout — the
 * user never autoexpels itself, and a failed attempt leaves everything untouched. */
describe("Change password HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_change_password_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "Change Password E2E",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("an incorrect current password changes nothing and closes no session", async () => {
    const loginA = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const cookiesA = loginA.get("Set-Cookie") ?? [];
    const loginB = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const cookiesB = loginB.get("Set-Cookie") ?? [];

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookiesA)
      .send({ currentPassword: "wrong", newPassword: "whatever-new-123" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CURRENT_PASSWORD");

    const meA = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookiesA);
    const meB = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookiesB);
    expect(meA.status).toBe(200);
    expect(meB.status).toBe(200);
  });

  it("2 logins (A, B): changing the password from A leaves B locked out immediately", async () => {
    const loginA = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const cookiesA = loginA.get("Set-Cookie") ?? [];
    const loginB = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const cookiesB = loginB.get("Set-Cookie") ?? [];

    const newPassword = "NewSup3rSecret!";
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookiesA)
      .send({ currentPassword: password, newPassword });
    expect(res.status).toBe(204);

    const meA = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookiesA);
    expect(meA.status).toBe(200);
    const meB = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookiesB);
    expect(meB.status).toBe(401);

    // The old password no longer works, the new one does — confirms the change itself
    // committed, not just the session revocation.
    const reloginOld = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    expect(reloginOld.status).toBe(401);
    const reloginNew = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: newPassword });
    expect(reloginNew.status).toBe(200);
  });
});
