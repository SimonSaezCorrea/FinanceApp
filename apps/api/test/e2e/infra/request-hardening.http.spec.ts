import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../src/app.module";
import { AllExceptionsFilter } from "../../../src/infra/http/all-exceptions.filter";
import { useJsonBodyLimit } from "../../../src/infra/http/body-limit";
import { useOriginCheck } from "../../../src/infra/http/origin-check";

/**
 * Security run-3 hardening, built the way `main.ts` builds the app: only the JSON parser is
 * registered (no urlencoded), and a browser write from an origin that isn't the site or the app is
 * refused before it reaches a route.
 */
describe("Request hardening (e2e)", () => {
  let app: NestExpressApplication;
  const APP_ORIGIN = "http://localhost:5173";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    useOriginCheck(app, [APP_ORIGIN]);
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    useJsonBodyLimit(app);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = () => request(app.getHttpServer()).post("/api/v1/auth/login");

  it("still parses JSON: a login body reaches validation and is answered by the domain", async () => {
    const res = await login()
      .set("Origin", APP_ORIGIN)
      .send({ identifierValue: "11.111.111-1", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("does not parse a urlencoded body: it arrives empty and fails validation", async () => {
    const res = await login()
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("identifierValue=111111111&password=whatever");
    expect(res.status).toBe(400);
  });

  it("refuses a write sent by a browser from another origin", async () => {
    const res = await login()
      .set("Origin", "https://evil.example")
      .send({ identifierValue: "11.111.111-1", password: "whatever" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("lets reads through whatever their origin", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("Origin", "https://evil.example");
    expect(res.status).toBeLessThan(500);
    expect(res.status).not.toBe(403);
  });

  it("refuses a large body outside the import routes, and takes it on them (security run-4)", async () => {
    const big = { identifierValue: "11.111.111-1", password: "x".repeat(300 * 1024) };
    const res = await login().send(big);
    expect(res.status).toBe(413);
    // The import routes keep the large limit: the same size reaches auth (401), not the parser.
    const imp = await request(app.getHttpServer())
      .post("/api/v1/import/template/preview")
      .send({ padding: "x".repeat(300 * 1024) });
    expect(imp.status).toBe(401);
  });
});
