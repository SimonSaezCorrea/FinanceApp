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

/**
 * E2E test: `POST /auth/me/delete-account` with `keepHistory: false` — the user's own explicit
 * choice to NOT keep an anonymized history. Verifies the `User` row and everything the
 * `onDelete: Cascade` FKs cover (here: a BankAccount) are genuinely gone, not just scrubbed.
 */
describe("Auth HTTP (e2e) — delete-account hard delete", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_hard_delete_${randomUUID()}@test.local`;
  const rut = randomValidRut();
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registered = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "E2E Hard Delete",
      identifierValue: rut,
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
    });
    userId = registered.body.id;
    cookies = registered.get("Set-Cookie") ?? [];

    const account = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({ name: "Cuenta a borrar", type: "CASH", currency: "CLP" });
    accountId = account.body.id;
  });

  afterAll(async () => {
    // If the assertions below are right, this is a no-op — the row is already gone. Left as a
    // safety net so a failing assertion doesn't leave debris in the dev DB.
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it("deletes the User row and cascades to every table this user owns", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/delete-account")
      .set("Cookie", cookies)
      .send({ password, keepHistory: false });
    expect(res.status).toBe(204);

    const row = await prisma.user.findUnique({ where: { id: userId } });
    expect(row).toBeNull();

    const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
    expect(account).toBeNull();
  });

  it("blocks further login with INVALID_CREDENTIALS", async () => {
    const loginAttempt = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    expect(loginAttempt.status).toBe(401);
    expect(loginAttempt.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});
