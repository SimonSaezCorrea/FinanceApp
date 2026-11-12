import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { appWithOutbox, lastToken, waitForEmail } from "../../support/email-outbox";
import { randomValidRut } from "../../support/rut";

/**
 * Security run-3: a requested change of email used to survive everything the owner does on
 * noticing — changing or recovering the password — and its link, opened on a public route, could
 * still make another address the primary (which then recovers the password). Now both cancel it,
 * and the current address is told when the change is REQUESTED, not only once it happened.
 */
describe("A pending email change vs. the owner's reaction (e2e)", () => {
  let app: INestApplication;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  const password = "Sup3rSecret!";
  const created: string[] = [];

  beforeAll(async () => {
    ({ app, outbox } = await appWithOutbox());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: created } } });
    await app.close();
  });

  /** A confirmed account whose session already stepped up, and a change requested to `target`. */
  async function withPendingChange(): Promise<{
    email: string;
    rut: string;
    target: string;
    cookies: string[];
  }> {
    const email = `e2e_cancel_${randomUUID()}@test.local`;
    const target = `e2e_cancel_target_${randomUUID()}@test.local`;
    const rut = randomValidRut();
    created.push(email, target);
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "Cancel Change",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });
    const cookies = res.get("Set-Cookie") ?? [];
    await request(app.getHttpServer())
      .post("/api/v1/auth/email/verify")
      .send({ token: lastToken(outbox, email, "verify-email") })
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", cookies)
      .send({ method: "password", password })
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/emails")
      .set("Cookie", cookies)
      .send({ address: target })
      .expect(201);
    return { email, rut, target, cookies };
  }

  const verify = (token: string) =>
    request(app.getHttpServer()).post("/api/v1/auth/email/verify").send({ token });

  it("the current address is told as soon as a change is requested", async () => {
    const { email, target } = await withPendingChange();
    const notice = await waitForEmail(outbox, email, "security-notice", "Se pidió cambiar");
    expect(notice.text).toContain(target);
  });

  it("changing the password cancels the pending change and its link", async () => {
    const { email, target, cookies } = await withPendingChange();
    const token = lastToken(outbox, target, "verify-email");

    await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookies)
      .send({ currentPassword: password, newPassword: "N3wSecret!pass" })
      .expect(204);

    const res = await verify(token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("EMAIL_TOKEN_INVALID");

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.email).toBe(email);
    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/emails")
      .set("Cookie", cookies);
    expect(list.body.items.some((e: { status: string }) => e.status === "PENDING")).toBe(false);
  });

  it("recovering the password cancels it too", async () => {
    const { email, rut, target } = await withPendingChange();
    const token = lastToken(outbox, target, "verify-email");

    await request(app.getHttpServer())
      .post("/api/v1/auth/password/forgot")
      .send({ identifierValue: rut })
      .expect(202);
    await waitForEmail(outbox, email, "reset-password");
    await request(app.getHttpServer())
      .post("/api/v1/auth/password/reset")
      .send({ token: lastToken(outbox, email, "reset-password"), newPassword: "N3wSecret!pass" })
      .expect(200);

    const res = await verify(token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("EMAIL_TOKEN_INVALID");
  });
});
