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

/** E2E (specs/023, US3): "cerrar todas las demás" from one of several active logins
 * revokes every other one immediately, while the acting session keeps working
 * throughout — the user never autoexpels itself. */
describe("Revoke other sessions HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_revoke_others_${randomUUID()}@test.local`;
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
      name: "Revoke Others E2E",
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

  it("3 logins (A, B, C): revoking others from A leaves B and C locked out immediately", async () => {
    const loginFor = async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ identifierValue: rut, password });
      return res.get("Set-Cookie") ?? [];
    };
    const cookiesA = await loginFor();
    const cookiesB = await loginFor();
    const cookiesC = await loginFor();

    // "Cerrar todas las demás" needs A's own recent step-up first (2026-09-25).
    await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", cookiesA)
      .send({ method: "password", password });

    const revokeRes = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/revoke-others")
      .set("Cookie", cookiesA);
    expect(revokeRes.status).toBe(204);

    const meB = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookiesB);
    const meC = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookiesC);
    expect(meB.status).toBe(401);
    expect(meC.status).toBe(401);

    const meA = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookiesA);
    expect(meA.status).toBe(200);

    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/sessions")
      .set("Cookie", cookiesA);
    const open = list.body.filter((s: { closedAt: string | null }) => s.closedAt === null);
    expect(open).toHaveLength(1);
    expect(open[0].isCurrent).toBe(true);
  });

  it("with only the current session active, revoking others is a harmless no-op", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    const cookies = login.get("Set-Cookie") ?? [];

    await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", cookies)
      .send({ method: "password", password });

    // Clear out whatever sessions the previous test left behind for this email so this
    // one starts from a known "single active session" state.
    await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/revoke-others")
      .set("Cookie", cookies);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/revoke-others")
      .set("Cookie", cookies);
    expect(res.status).toBe(204);

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.status).toBe(200);
  });
});
