import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../src/app.module";
import { useCors } from "../../../src/infra/http/cors";

/** FR-018 (specs/031): only the public site and the app may call the API with credentials. */
describe("CORS (e2e)", () => {
  let app: INestApplication;
  const LANDING = "http://localhost:4321";
  const WEB = "http://localhost:5173";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ ...process.env, CORS_ORIGIN: `${LANDING},${WEB}` }))
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    useCors(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([LANDING, WEB])("answers %s with its own origin and credentials", async (origin) => {
    const res = await request(app.getHttpServer())
      .options("/api/v1/auth/me")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "GET");
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("gives an unknown origin no Access-Control-Allow-Origin", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
