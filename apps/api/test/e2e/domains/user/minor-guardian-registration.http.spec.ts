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
 * E2E test: Ley 21.719's reinforced regime for a minor titular — a real (not mocked) minimum
 * age of 10 years back for `birthDate` puts the registration under
 * `auth.MINOR_GUARDIAN_THRESHOLD_AGE`, requiring `guardianAuthorization` in the same request.
 */
describe("Auth HTTP (e2e) — minor guardian registration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const minorEmail = `e2e_minor_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  let minorUserId: string | undefined;

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
    if (minorUserId) await prisma.user.deleteMany({ where: { id: minorUserId } });
    await app.close();
  });

  it("rejects a minor registering with no guardianAuthorization", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: minorEmail,
        password,
        name: "Kid",
        birthDate: tenYearsAgo.toISOString(),
        sensitiveDataConsent: true,
      });
    expect(res.status).toBe(400);
  });

  it("registers a minor when guardianAuthorization is complete, and records both consents", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: minorEmail,
        password,
        name: "Kid",
        birthDate: tenYearsAgo.toISOString(),
        sensitiveDataConsent: true,
        guardianAuthorization: {
          name: "Ana Madre",
          identifierValue: "11.111.111-1",
          relationship: "MOTHER",
          accepted: true,
        },
      });
    expect(res.status).toBe(201);
    minorUserId = res.body.id;

    const rows = await prisma.consentRecord.findMany({ where: { userId: minorUserId } });
    const types = rows.map((r) => r.type).sort();
    expect(types).toEqual(["MINOR_GUARDIAN_AUTHORIZATION", "SENSITIVE_DATA_PROCESSING"]);

    const guardianRow = rows.find((r) => r.type === "MINOR_GUARDIAN_AUTHORIZATION")!;
    expect(guardianRow.guardianName).toBe("Ana Madre");
    expect(guardianRow.guardianRelationship).toBe("MOTHER");
    // Never the raw RUT.
    expect(guardianRow.guardianIdentifierHash).not.toBe("11.111.111-1");
    expect(guardianRow.guardianIdentifierHash).not.toBeNull();
  });

  it("GET /auth/me/consents exposes the guardian's name/relationship, never the hash", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: minorEmail, password });
    const cookies = login.get("Set-Cookie") ?? [];

    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/me/consents")
      .set("Cookie", cookies);
    expect(res.status).toBe(200);
    const guardianConsent = res.body.find(
      (c: { type: string }) => c.type === "MINOR_GUARDIAN_AUTHORIZATION",
    );
    expect(guardianConsent.guardianName).toBe("Ana Madre");
    expect(guardianConsent.guardianRelationship).toBe("MOTHER");
    expect(guardianConsent.guardianIdentifierHash).toBeUndefined();
  });
});
