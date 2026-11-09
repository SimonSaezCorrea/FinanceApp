import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
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

import { ReviewCompromisedPasskeysCommand } from "../../../../src/domains/user/application/commands/review-compromised-passkeys.command";
import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { waitForEmail } from "../../support/email-outbox";
import { cookiePairs, registerConfirmed, type TestAccount, stepUp } from "../../support/mfa";
import {
  appWithCatalog,
  attestedResponse,
  type InMemoryCatalog,
} from "../../support/passkey-attestation";

const MODEL = "cb69481e-8ff7-4039-93ec-0a2729a154a8";

/** E2E (specs/041 US3): a verified passkey whose model becomes compromised stops working. */
describe("Compromised passkey HTTP (e2e)", () => {
  let app: INestApplication;
  let catalog: InMemoryCatalog;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  let account: TestAccount;
  let passkeySession: string[];
  const credentialId = `cred_${randomUUID()}`;

  const http = () => request(app.getHttpServer());

  async function passkeyLogin() {
    const options = await http().post("/api/v1/auth/login/passkey-options").send({
      identifierValue: account.rut,
    });
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    } as never);
    return http()
      .post("/api/v1/auth/login/passkey-verify")
      .set("Cookie", options.get("Set-Cookie") ?? [])
      .send({ response: { id: credentialId } });
  }

  const review = () =>
    app.get(CommandBus).execute(new ReviewCompromisedPasskeysCommand(new Date()));

  const compromiseEmails = () =>
    outbox.sent.filter((e) => e.to === account.email && e.subject.includes("ya no es segura"));

  beforeAll(async () => {
    ({ app, catalog, outbox } = await appWithCatalog());
    prisma = app.get(PrismaService);
    catalog.add(MODEL, "YubiKey 5 Series with NFC");
    account = await registerConfirmed(app, outbox, "passkey_compromised");

    // A verified passkey (the library's attestation check is stubbed: no real authenticator).
    await stepUp(app, account.cookies);
    const options = await http()
      .post("/api/v1/auth/me/passkeys/register-options")
      .set("Cookie", account.cookies);
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        aaguid: MODEL,
        credential: { id: credentialId, publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
      },
    } as never);
    const created = await http()
      .post("/api/v1/auth/me/passkeys/register-verify")
      .set("Cookie", [...account.cookies, ...(options.get("Set-Cookie") ?? [])])
      .send({ name: "YubiKey del trabajo", response: attestedResponse(MODEL) });
    expect(created.body.status).toBe("verified");

    const login = await passkeyLogin();
    expect(login.status).toBe(200);
    passkeySession = cookiePairs(login.get("Set-Cookie") ?? []);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: account.email } });
    await app.close();
  });

  it("nothing changes while the model is fine", async () => {
    expect(await review()).toMatchObject({ marked: 0 });
    expect((await http().get("/api/v1/auth/me").set("Cookie", passkeySession)).status).toBe(200);
  });

  it("once the catalog declares the model compromised, the review blocks the passkey and its session", async () => {
    catalog.add(MODEL, "YubiKey 5 Series with NFC", "REVOKED");
    expect(await review()).toEqual({ marked: 1, sessionsClosed: 1 });

    // The session opened with the passkey is closed; the one opened with the password is not.
    expect((await http().get("/api/v1/auth/me").set("Cookie", passkeySession)).status).toBe(401);
    expect((await http().get("/api/v1/auth/me").set("Cookie", account.cookies)).status).toBe(200);

    const again = await passkeyLogin();
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe("PASSKEY_COMPROMISED");

    const list = await http().get("/api/v1/auth/me/passkeys").set("Cookie", account.cookies);
    expect(list.body[0]).toMatchObject({
      status: "compromised",
      authenticatorName: "YubiKey 5 Series with NFC",
    });
    expect(list.body[0].compromisedAt).toEqual(expect.any(String));

    await waitForEmail(outbox, account.email, "security-notice", "ya no es segura");
    expect(compromiseEmails()).toHaveLength(1);
  });

  it("no longer confirms identity (step-up)", async () => {
    const options = await http()
      .post("/api/v1/auth/sessions/step-up/passkey-options")
      .set("Cookie", account.cookies);
    const res = await http()
      .post("/api/v1/auth/sessions/step-up/passkey-verify")
      .set("Cookie", [...account.cookies, ...(options.get("Set-Cookie") ?? [])])
      .send({ response: { id: credentialId } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PASSKEY_COMPROMISED");
  });

  it("a second review changes nothing and sends nothing", async () => {
    expect(await review()).toEqual({ marked: 0, sessionsClosed: 0 });
    await new Promise((r) => setTimeout(r, 200));
    expect(compromiseEmails()).toHaveLength(1);
  });

  it("stays blocked even if the catalog later withdraws the alert", async () => {
    catalog.add(MODEL, "YubiKey 5 Series with NFC", null);
    await review();
    expect((await passkeyLogin()).status).toBe(403);
  });

  it("can still be renamed and removed", async () => {
    const list = await http().get("/api/v1/auth/me/passkeys").set("Cookie", account.cookies);
    const id = list.body[0].id as string;
    const renamed = await http()
      .patch(`/api/v1/auth/me/passkeys/${id}`)
      .set("Cookie", account.cookies)
      .send({ name: "Vieja" });
    expect(renamed.body).toMatchObject({ name: "Vieja", status: "compromised" });
    const removed = await http()
      .delete(`/api/v1/auth/me/passkeys/${id}`)
      .set("Cookie", account.cookies);
    expect(removed.status).toBe(204);
  });
});
