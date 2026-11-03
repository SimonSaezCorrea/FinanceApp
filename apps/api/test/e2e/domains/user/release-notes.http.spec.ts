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

/** E2E (spec 038): the newest Novedades version seen is kept on the account — another login
 * already sees it — and it only moves forward. */
describe("Release notes seen HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_release_notes_${randomUUID()}@test.local`;
  const rut = randomValidRut();
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
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "Release Notes E2E",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });
    cookies = res.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const mark = (version: unknown) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/me/release-notes/seen")
      .set("Cookie", cookies)
      .send({ version });
  const seen = async () =>
    (await prisma.user.findFirst({ where: { email } }))?.releaseNotesSeenVersion ?? null;

  it("starts with nothing seen, marks, never goes back, and another login sees it", async () => {
    const before = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(before.body.releaseNotesSeenVersion).toBeNull();

    expect((await mark("1.10")).status).toBe(204);
    expect(await seen()).toBe("1.10");

    expect((await mark("1.10")).status).toBe(204);
    expect((await mark("1.9")).status).toBe(204);
    expect(await seen()).toBe("1.10");

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    const other = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", login.get("Set-Cookie") ?? []);
    expect(other.body.releaseNotesSeenVersion).toBe("1.10");
  });

  it("refuses something that isn't a version", async () => {
    for (const bad of ["v1.2", "1", "1.2.3", "2026-10-26-guias-chile", 42]) {
      const res = await mark(bad);
      expect(res.status).toBe(400);
      expect(res.body.error.field).toBe("version");
    }
  });

  it("needs a session", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/release-notes/seen")
      .send({ version: "1.1" });
    expect(res.status).toBe(401);
  });
});
