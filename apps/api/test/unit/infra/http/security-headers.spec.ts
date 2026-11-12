import { Controller, Get, Module } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SECURITY_HEADERS, useSecurityHeaders } from "../../../../src/infra/http/security-headers";

@Controller("health")
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

describe("useSecurityHeaders", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    useSecurityHeaders(app);
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(["/api/v1/health", "/api/v1/nowhere"])("sets every header on %s", async (path) => {
    const res = await request(app.getHttpServer()).get(path);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers[name.toLowerCase()]).toBe(value);
    }
  });
});
