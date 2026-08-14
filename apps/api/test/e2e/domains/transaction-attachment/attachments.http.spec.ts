import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { OBJECT_STORAGE } from "../../../../src/domains/transaction-attachment/domain/ports/object-storage.port";
import type { ObjectStoragePort } from "../../../../src/domains/transaction-attachment/domain/ports/object-storage.port";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Full attachment flow over HTTP with the bucket replaced by an in-memory
 * double — CI has no S3, and what's under test here is the API's behaviour, not
 * AWS's. The "no storage configured" path gets its own app instance.
 */
describe("Attachments HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_${randomUUID()}@test.local`;
  const otherEmail = `e2e_${randomUUID()}@test.local`;
  let cookies: string[] = [];
  let otherCookies: string[] = [];
  let transactionId = "";
  let attachmentId = "";
  const objects = new Map<string, Uint8Array>();

  const storage: ObjectStoragePort = {
    isConfigured: () => true,
    put: async (key, body) => void objects.set(key, body),
    getSignedUrl: async (key) => `https://bucket.test/${key}?sig=x`,
    delete: async (key) => void objects.delete(key),
  };

  const api = () => request(app.getHttpServer());

  async function bootstrap(objectStorage: ObjectStoragePort) {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(objectStorage)
      .compile();
    const instance = moduleRef.createNestApplication();
    instance.setGlobalPrefix("api/v1");
    instance.use(cookieParser());
    instance.useGlobalFilters(new AllExceptionsFilter());
    await instance.init();
    return instance;
  }

  beforeAll(async () => {
    app = await bootstrap(storage);
    prisma = app.get(PrismaService);

    const register = await api()
      .post("/api/v1/auth/register")
      .send({ email, password: "Sup3rSecret!", name: "E2E" });
    cookies = register.get("Set-Cookie") ?? [];
    const registerOther = await api()
      .post("/api/v1/auth/register")
      .send({ email: otherEmail, password: "Sup3rSecret!", name: "Other" });
    otherCookies = registerOther.get("Set-Cookie") ?? [];

    const account = await api().post("/api/v1/accounts").set("Cookie", cookies).send({
      name: "Cuenta",
      type: "CHECKING",
      currency: "CLP",
      accountNumber: "1234",
      initialBalance: "10000",
    });
    const movement = await api().post("/api/v1/transactions").set("Cookie", cookies).send({
      type: "EXPENSE",
      amount: "1000",
      currency: "CLP",
      occurredAt: "2026-08-01T00:00:00.000Z",
      bankAccountId: account.body.id,
    });
    transactionId = movement.body.id;
  });

  afterAll(async () => {
    await prisma.transactionAttachment.deleteMany({ where: { user: { email } } });
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  it("uploads a receipt", async () => {
    const res = await api()
      .post(`/api/v1/transactions/${transactionId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", PDF, { filename: "boleta.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    attachmentId = res.body.id;
    expect(res.body.fileName).toBe("boleta.pdf");
    expect(objects.size).toBe(1);
  });

  it("lists it", async () => {
    const res = await api()
      .get(`/api/v1/transactions/${transactionId}/attachments`)
      .set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("signs a read url", async () => {
    const res = await api()
      .get(`/api/v1/transactions/${transactionId}/attachments/${attachmentId}/url`)
      .set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("https://bucket.test/");
  });

  it("rejects a type outside the list", async () => {
    const res = await api()
      .post(`/api/v1/transactions/${transactionId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", Buffer.from("PK"), {
        filename: "x.zip",
        contentType: "application/zip",
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ATTACHMENT_TYPE_NOT_ALLOWED");
  });

  it("rejects bytes that don't match the declared type", async () => {
    const res = await api()
      .post(`/api/v1/transactions/${transactionId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", PDF, { filename: "fake.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ATTACHMENT_TYPE_NOT_ALLOWED");
  });

  it("rejects a file over the size cap", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await api()
      .post(`/api/v1/transactions/${transactionId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("404s for someone else's attachment", async () => {
    const res = await api()
      .get(`/api/v1/transactions/${transactionId}/attachments`)
      .set("Cookie", otherCookies);
    // The movement isn't theirs, so there is nothing to see — never a 403.
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    const del = await api()
      .delete(`/api/v1/transactions/${transactionId}/attachments/${attachmentId}`)
      .set("Cookie", otherCookies);
    expect(del.status).toBe(404);
  });

  it("deletes it", async () => {
    const res = await api()
      .delete(`/api/v1/transactions/${transactionId}/attachments/${attachmentId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);
    expect(objects.size).toBe(0);
  });

  it("deleting the movement cascades its attachments away", async () => {
    await api()
      .post(`/api/v1/transactions/${transactionId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", PDF, { filename: "otra.pdf", contentType: "application/pdf" });

    await api().delete(`/api/v1/transactions/${transactionId}`).set("Cookie", cookies);

    expect(await prisma.transactionAttachment.count({ where: { transactionId } })).toBe(0);
  });

  it("answers 503 while no storage is configured", async () => {
    const inert = await bootstrap({ ...storage, isConfigured: () => false });
    const login = await request(inert.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "Sup3rSecret!" });
    const inertCookies = login.get("Set-Cookie") ?? [];

    const movement = await request(inert.getHttpServer())
      .get("/api/v1/transactions")
      .set("Cookie", inertCookies);
    const anyId = movement.body.items[0]?.id ?? "none";

    const res = await request(inert.getHttpServer())
      .post(`/api/v1/transactions/${anyId}/attachments`)
      .set("Cookie", inertCookies)
      .attach("file", PDF, { filename: "boleta.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("ATTACHMENTS_UNAVAILABLE");
    await inert.close();
  });
});
