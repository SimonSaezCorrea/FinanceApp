import { Controller, Get, Module } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { useNoIndex } from "../../../../src/infra/http/no-index";

@Controller("health")
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

/** Search Console flagged `api.mifik.cl` URLs (a 401 from `/auth/me`): the API is never a page. */
describe("useNoIndex", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    useNoIndex(app);
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves a robots.txt that keeps every crawler out", async () => {
    const res = await request(app.getHttpServer()).get("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/plain/);
    expect(res.text).toBe("User-agent: *\nDisallow: /\n");
  });

  it("marks every response noindex, the API's and its errors alike", async () => {
    const ok = await request(app.getHttpServer()).get("/api/v1/health");
    expect(ok.status).toBe(200);
    expect(ok.headers["x-robots-tag"]).toBe("noindex, nofollow");
    const missing = await request(app.getHttpServer()).get("/api/v1/nope");
    expect(missing.status).toBe(404);
    expect(missing.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
});
