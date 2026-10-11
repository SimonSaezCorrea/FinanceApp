import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { appWithOutbox, lastToken, waitForEmail } from "../../support/email-outbox";
import { randomValidRut } from "../../support/rut";

/** E2E (specs/032 US1): confirming the address from registration, and changing it through a
 * pending address that only becomes the primary once its own link is opened. */
describe("Account emails HTTP (e2e)", () => {
  let app: INestApplication;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  const email = `e2e_emails_${randomUUID()}@test.local`;
  const newEmail = `e2e_emails_new_${randomUUID()}@test.local`;
  const otherEmail = `e2e_emails_other_${randomUUID()}@test.local`;
  const rut = randomValidRut();
  const password = "Sup3rSecret!";
  let cookies: string[] = [];

  const register = (address: string, identifierValue: string) =>
    request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: address,
      password,
      name: "Emails E2E",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue,
    });

  beforeAll(async () => {
    ({ app, outbox } = await appWithOutbox());
    prisma = app.get(PrismaService);
    const res = await register(email, rut);
    cookies = res.get("Set-Cookie") ?? [];
    await register(otherEmail, randomValidRut());
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [email, newEmail, otherEmail] } } });
    await app.close();
  });

  it("registration creates an unconfirmed primary and sends its link", async () => {
    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.emailVerified).toBe(false);

    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/emails")
      .set("Cookie", cookies);
    expect(list.body.items).toEqual([
      expect.objectContaining({ address: email, status: "PRIMARY", verifiedAt: null }),
    ]);
    expect(outbox.last(email, "verify-email")).toBeDefined();
  });

  it("resending right after registration reuses the link sent seconds ago", async () => {
    const before = outbox.sent.length;
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/email/verification")
      .set("Cookie", cookies);
    expect(res.status).toBe(202);
    expect(outbox.sent.length).toBe(before);
  });

  it("the link confirms the address once; a second use is refused", async () => {
    const token = lastToken(outbox, email, "verify-email");
    const ok = await request(app.getHttpServer()).post("/api/v1/auth/email/verify").send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ verified: true });

    const again = await request(app.getHttpServer())
      .post("/api/v1/auth/email/verify")
      .send({ token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("EMAIL_TOKEN_INVALID");

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.emailVerified).toBe(true);
  });

  it("a malformed token fails validation before any lookup", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/email/verify")
      .send({ token: "nope" });
    expect(res.status).toBe(400);
  });

  it("resending once confirmed answers EMAIL_ALREADY_VERIFIED", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/email/verification")
      .set("Cookie", cookies);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_VERIFIED");
  });

  it("PATCH /auth/me no longer accepts an email", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/auth/me")
      .set("Cookie", cookies)
      .send({ email: newEmail });
    expect(res.status).toBe(400);
  });

  it("asking for the current primary or another account's address is refused", async () => {
    const same = await request(app.getHttpServer())
      .post("/api/v1/auth/me/emails")
      .set("Cookie", cookies)
      .send({ address: email.toUpperCase() });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe("EMAIL_ALREADY_PRIMARY");

    const taken = await request(app.getHttpServer())
      .post("/api/v1/auth/me/emails")
      .set("Cookie", cookies)
      .send({ address: otherEmail });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("a change stays pending until its link; then it becomes the primary and the old one is told", async () => {
    const asked = await request(app.getHttpServer())
      .post("/api/v1/auth/me/emails")
      .set("Cookie", cookies)
      .send({ address: newEmail });
    expect(asked.status).toBe(201);
    expect(asked.body.item).toMatchObject({ address: newEmail, status: "PENDING" });

    // Still signed in and still using the old address until confirmed.
    const before = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(before.body.email).toBe(email);

    const verify = await request(app.getHttpServer())
      .post("/api/v1/auth/email/verify")
      .send({ token: lastToken(outbox, newEmail, "verify-email") });
    expect(verify.status).toBe(200);

    const after = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(after.body).toMatchObject({ email: newEmail, emailVerified: true });

    const notice = await waitForEmail(outbox, email, "security-notice");
    expect(notice.text).toContain(newEmail);

    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/emails")
      .set("Cookie", cookies);
    expect(list.body.items.map((e: { status: string }) => e.status)).toEqual(["PRIMARY", "PAST"]);
  });

  it("the primary can't be deleted; a past address can, and only by its owner", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/emails")
      .set("Cookie", cookies);
    const [primary, past] = list.body.items as { id: string }[];

    const refused = await request(app.getHttpServer())
      .delete(`/api/v1/auth/me/emails/${primary!.id}`)
      .set("Cookie", cookies);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("EMAIL_PRIMARY_NOT_DELETABLE");

    const foreign = await request(app.getHttpServer())
      .delete(`/api/v1/auth/me/emails/${randomUUIDv7Like(past!.id)}`)
      .set("Cookie", cookies);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("EMAIL_NOT_FOUND");

    const removed = await request(app.getHttpServer())
      .delete(`/api/v1/auth/me/emails/${past!.id}`)
      .set("Cookie", cookies);
    expect(removed.status).toBe(204);
  });

  it("a malformed id is rejected before any query", async () => {
    const res = await request(app.getHttpServer())
      .delete("/api/v1/auth/me/emails/not-an-id")
      .set("Cookie", cookies);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID_FORMAT");
  });
});

/** Another well-formed v7 id: the same one with its last hex digit changed. */
function randomUUIDv7Like(id: string): string {
  const last = id.slice(-1) === "0" ? "1" : "0";
  return id.slice(0, -1) + last;
}
