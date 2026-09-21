import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return { ...actual, verifyRegistrationResponse: vi.fn() };
});

import { verifyRegistrationResponse } from "@simplewebauthn/server";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

describe("Passkey management HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_passkeymgmt_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];

  async function registerPasskey(name: string) {
    const options = await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-options")
      .set("Cookie", cookies);
    const regCookies = options.get("Set-Cookie") ?? [];
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: `cred_${randomUUID()}`, publicKey: new Uint8Array([1]), counter: 0 },
      },
    } as never);
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-verify")
      .set("Cookie", [...cookies, ...regCookies])
      .send({ name, response: {} });
    return res.body.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Passkey Mgmt", sensitiveDataConsent: true });
    cookies = res.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.passkey.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("registering two keys, deleting one, leaves only the other", async () => {
    const idA = await registerPasskey("Laptop");
    const idB = await registerPasskey("Phone");

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/auth/me/passkeys/${idA}`)
      .set("Cookie", cookies);
    expect(del.status).toBe(204);

    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/passkeys")
      .set("Cookie", cookies);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(idB);
  });

  it("deleting an already-deleted passkey responds PASSKEY_NOT_FOUND", async () => {
    const id = await registerPasskey("Throwaway");
    const first = await request(app.getHttpServer())
      .delete(`/api/v1/auth/me/passkeys/${id}`)
      .set("Cookie", cookies);
    expect(first.status).toBe(204);

    const second = await request(app.getHttpServer())
      .delete(`/api/v1/auth/me/passkeys/${id}`)
      .set("Cookie", cookies);
    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe("PASSKEY_NOT_FOUND");
  });

  it("renames a passkey without touching its usage history", async () => {
    const id = await registerPasskey("Old Name");

    const rename = await request(app.getHttpServer())
      .patch(`/api/v1/auth/me/passkeys/${id}`)
      .set("Cookie", cookies)
      .send({ name: "New Name" });
    expect(rename.status).toBe(200);
    expect(rename.body.name).toBe("New Name");
    expect(rename.body.lastUsedAt).toBeNull();

    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/passkeys")
      .set("Cookie", cookies);
    expect(list.body.find((p: { id: string }) => p.id === id)?.name).toBe("New Name");
  });

  it("rejects renaming with an empty name, and renaming a foreign/nonexistent passkey", async () => {
    const id = await registerPasskey("Mine");
    const otherEmail = `e2e_passkeymgmt_other_${randomUUID()}@test.local`;

    const empty = await request(app.getHttpServer())
      .patch(`/api/v1/auth/me/passkeys/${id}`)
      .set("Cookie", cookies)
      .send({ name: "" });
    expect(empty.status).toBe(400);

    const other = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: otherEmail, password, name: "Other", sensitiveDataConsent: true });
    const otherCookies = other.get("Set-Cookie") ?? [];
    const foreign = await request(app.getHttpServer())
      .patch(`/api/v1/auth/me/passkeys/${id}`)
      .set("Cookie", otherCookies)
      .send({ name: "Hijacked" });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("PASSKEY_NOT_FOUND");

    await prisma.user.deleteMany({ where: { email: otherEmail } });
  });

  it("deleting the LAST passkey leaves password login completely unaffected", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/passkeys")
      .set("Cookie", cookies);
    for (const p of list.body as { id: string }[]) {
      await request(app.getHttpServer())
        .delete(`/api/v1/auth/me/passkeys/${p.id}`)
        .set("Cookie", cookies);
    }

    const emptyList = await request(app.getHttpServer())
      .get("/api/v1/auth/me/passkeys")
      .set("Cookie", cookies);
    expect(emptyList.body).toEqual([]);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ mfaRequired: false, user: login.body.user });
  });
});
