import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return {
    ...actual,
    verifyRegistrationResponse: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
  };
});

import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";

import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { appWithOutbox } from "../../support/email-outbox";
import { registerConfirmed, totpCodeFor } from "../../support/mfa";

/**
 * Security regression: a session that holds no recent step-up must not be able to ADD a factor
 * that then satisfies the step-up (a passkey, or the first second factor of an account with MFA
 * off). Otherwise a stolen session bootstraps its own step-up and changes the email, which
 * leads to password recovery and the account.
 */
describe("Step-up cannot be bootstrapped from the session it protects (e2e)", () => {
  let app: INestApplication;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  const emails: string[] = [];

  beforeAll(async () => {
    ({ app, outbox } = await appWithOutbox());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.passkey.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it("registering a passkey needs a recent step-up", async () => {
    const victim = await registerConfirmed(app, outbox, "bootstrap_passkey");
    emails.push(victim.email);
    const credentialId = `cred_${randomUUID()}`;

    const options = await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-options")
      .set("Cookie", victim.cookies);

    if (options.status === 201) {
      // The chain the guard must stop: add a passkey → step up with it → change the email.
      vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: { id: credentialId, publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
        },
      } as never);
      await request(app.getHttpServer())
        .post("/api/v1/auth/me/passkeys/register-verify")
        .set("Cookie", [...victim.cookies, ...(options.get("Set-Cookie") ?? [])])
        .send({ name: "Attacker key", response: {} });

      const stepUpOptions = await request(app.getHttpServer())
        .post("/api/v1/auth/sessions/step-up/passkey-options")
        .set("Cookie", victim.cookies);
      vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
        verified: true,
        authenticationInfo: { newCounter: 1 },
      } as never);
      await request(app.getHttpServer())
        .post("/api/v1/auth/sessions/step-up/passkey-verify")
        .set("Cookie", [...victim.cookies, ...(stepUpOptions.get("Set-Cookie") ?? [])])
        .send({ response: { id: credentialId } });

      const change = await request(app.getHttpServer())
        .post("/api/v1/auth/me/emails")
        .set("Cookie", victim.cookies)
        .send({ address: `attacker_${randomUUID()}@test.local` });
      expect(change.status, "email change after a self-added passkey step-up").toBe(403);
    }

    expect(options.status).toBe(403);
    expect(options.body.error.code).toBe("STEP_UP_REQUIRED");
  });

  it("the first MFA enrolment needs a recent step-up", async () => {
    const victim = await registerConfirmed(app, outbox, "bootstrap_totp");
    emails.push(victim.email);

    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", victim.cookies)
      .send({ method: "totp" });

    if (enroll.status < 300) {
      // The chain the guard must stop: enrol own TOTP → step up with it → change the email.
      const secret = enroll.body.secret as string;
      await request(app.getHttpServer())
        .post("/api/v1/auth/me/mfa/confirm")
        .set("Cookie", victim.cookies)
        .send({ code: await totpCodeFor(secret) });
      await request(app.getHttpServer())
        .post("/api/v1/auth/sessions/step-up")
        .set("Cookie", victim.cookies)
        .send({ method: "totp", code: await totpCodeFor(secret) });

      const change = await request(app.getHttpServer())
        .post("/api/v1/auth/me/emails")
        .set("Cookie", victim.cookies)
        .send({ address: `attacker_${randomUUID()}@test.local` });
      expect(change.status, "email change after a self-enrolled TOTP step-up").toBe(403);
    }

    expect(enroll.status).toBe(403);
    expect(enroll.body.error.code).toBe("STEP_UP_REQUIRED");
  });
});
