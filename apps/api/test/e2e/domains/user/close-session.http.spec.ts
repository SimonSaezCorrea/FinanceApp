import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { generateRowId } from "../../../../src/infra/id/generate-row-id";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { randomValidRut } from "../../support/rut";

/** E2E (specs/023, US2): closing a session revokes that device immediately — the
 * still-technically-unexpired access token stops working on its very next request,
 * not just on its next refresh (research.md R2) — while an unrelated session (or the
 * one performing the action) is never affected. */
describe("Close session HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_close_session_${randomUUID()}@test.local`;
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
      name: "Close Session E2E",
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

  it("closing a non-current session revokes it immediately without affecting the current one", async () => {
    const loginA = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    const cookiesA = loginA.get("Set-Cookie") ?? [];

    const loginB = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    const cookiesB = loginB.get("Set-Cookie") ?? [];

    const listA = await request(app.getHttpServer())
      .get("/api/v1/auth/sessions")
      .set("Cookie", cookiesA);
    const sessionB = listA.body.find((s: { isCurrent: boolean }) => !s.isCurrent);
    expect(sessionB).toBeDefined();

    const closeRes = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${sessionB.id}`)
      .set("Cookie", cookiesA);
    expect(closeRes.status).toBe(204);

    // B's own access token is still cryptographically valid and unexpired — but its
    // session row is now marked closed (survives for the retention window, never
    // deleted here), so the guard must reject it right away.
    const meB = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookiesB);
    expect(meB.status).toBe(401);

    // The closed session stays visible in the list, marked as such — never vanishes.
    const listAAfter = await request(app.getHttpServer())
      .get("/api/v1/auth/sessions")
      .set("Cookie", cookiesA);
    const closedRow = listAAfter.body.find((s: { id: string }) => s.id === sessionB.id);
    expect(closedRow?.closedAt).not.toBeNull();

    // A was never the target — it keeps working throughout.
    const meA = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookiesA);
    expect(meA.status).toBe(200);
  });

  it("closing the caller's OWN current session expels it immediately too (spec.md edge case)", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    const cookies = login.get("Set-Cookie") ?? [];

    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/sessions")
      .set("Cookie", cookies);
    const current = list.body.find((s: { isCurrent: boolean }) => s.isCurrent);
    expect(current).toBeDefined();

    const closeRes = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${current.id}`)
      .set("Cookie", cookies);
    expect(closeRes.status).toBe(204);

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.status).toBe(401);
  });

  it("closing a session that isn't the caller's own answers 404 SESSION_NOT_FOUND", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    const cookies = login.get("Set-Cookie") ?? [];

    // A well-formed UUID v7 (matching rowId's format requirement) that simply doesn't
    // exist — a v4 randomUUID() here would fail earlier with 400 INVALID_ID_FORMAT
    // instead of exercising the 404 path this test is actually about.
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${generateRowId()}`)
      .set("Cookie", cookies);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("SESSION_NOT_FOUND");
  });
});
