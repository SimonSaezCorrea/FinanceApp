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

/** E2E (spec 031): `GET /auth/session` tells the public site whether this browser is signed in —
 * always a 200, so a signed-out visitor leaves no 401 in the console. */
describe("Session status HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_session_status_${randomUUID()}@test.local`;
  const rut = randomValidRut();
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
      name: "Session Status E2E",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const status = (cookies: string[] = []) =>
    request(app.getHttpServer()).get("/api/v1/auth/session").set("Cookie", cookies);

  it("answers 200 signed out with no cookies, and with forged ones", async () => {
    const none = await status();
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ signedIn: false });

    const forged = await status(["access_token=forged", "refresh_token=forged"]);
    expect(forged.status).toBe(200);
    expect(forged.body).toEqual({ signedIn: false });
  });

  it("is signed in after logging in, from the refresh cookie alone too, and out after logout", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    const cookies = login.get("Set-Cookie") ?? [];

    expect((await status(cookies)).body).toEqual({ signedIn: true });

    const refreshOnly = cookies.filter((c) => c.startsWith("refresh_token="));
    expect((await status(refreshOnly)).body).toEqual({ signedIn: true });

    await request(app.getHttpServer()).post("/api/v1/auth/logout").set("Cookie", cookies);
    expect((await status(cookies)).body).toEqual({ signedIn: false });
  });
});
