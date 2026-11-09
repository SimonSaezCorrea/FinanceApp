import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return { ...actual, verifyRegistrationResponse: vi.fn() };
});

import { verifyRegistrationResponse } from "@simplewebauthn/server";

import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { waitForEmail } from "../../support/email-outbox";
import { registerConfirmed, type TestAccount, stepUp } from "../../support/mfa";
import {
  appWithCatalog,
  attestedResponse,
  type InMemoryCatalog,
} from "../../support/passkey-attestation";

const GOOD = "cb69481e-8ff7-4039-93ec-0a2729a154a8";
const BAD = "ee882879-721c-4913-9775-3dfcce97072a";

/** E2E (specs/041 US1/US2): registering passkeys with and without a verified authenticator. */
describe("Passkey attestation HTTP (e2e)", () => {
  let app: INestApplication;
  let catalog: InMemoryCatalog;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  let account: TestAccount;

  const http = () => request(app.getHttpServer());

  /** register-options → (stubbed library) → register-verify. */
  async function register(name: string, response: unknown, aaguid: string) {
    await stepUp(app, account.cookies);
    const options = await http()
      .post("/api/v1/auth/me/passkeys/register-options")
      .set("Cookie", account.cookies);
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        aaguid,
        credential: {
          id: `cred_${randomUUID()}`,
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    } as never);
    return http()
      .post("/api/v1/auth/me/passkeys/register-verify")
      .set("Cookie", [...account.cookies, ...(options.get("Set-Cookie") ?? [])])
      .send({ name, response });
  }

  const list = async () =>
    (await http().get("/api/v1/auth/me/passkeys").set("Cookie", account.cookies)).body as {
      name: string;
      status: string;
      authenticatorName: string | null;
    }[];

  beforeAll(async () => {
    ({ app, catalog, outbox } = await appWithCatalog());
    prisma = app.get(PrismaService);
    catalog.add(GOOD, "YubiKey 5 Series with NFC");
    catalog.add(BAD, "Llave insegura", "ATTESTATION_KEY_COMPROMISE");
    account = await registerConfirmed(app, outbox, "passkey_attest");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: account.email } });
    await app.close();
  });

  it("asks the browser for the maker's attestation", async () => {
    await stepUp(app, account.cookies);
    const options = await http()
      .post("/api/v1/auth/me/passkeys/register-options")
      .set("Cookie", account.cookies);
    expect(options.body.options.attestation).toBe("direct");
  });

  it("suggests the model's name from the response, saving nothing", async () => {
    const res = await http()
      .post("/api/v1/auth/me/passkeys/register-suggestion")
      .set("Cookie", account.cookies)
      .send({ response: attestedResponse(GOOD) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestedName: "YubiKey 5 Series with NFC" });
    const unknown = await http()
      .post("/api/v1/auth/me/passkeys/register-suggestion")
      .set("Cookie", account.cookies)
      .send({ response: { not: "a response" } });
    expect(unknown.body).toEqual({ suggestedName: null });
    expect(await list()).toHaveLength(0);
  });

  it("a verified authenticator shows its model, and the notice names it", async () => {
    const res = await register("Llave del trabajo", attestedResponse(GOOD), GOOD);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "verified",
      authenticatorName: "YubiKey 5 Series with NFC",
    });
    const email = await waitForEmail(outbox, account.email, "security-notice", "llave de acceso");
    expect(email.text).toContain("YubiKey 5 Series with NFC");
  });

  it("a passkey with no attestation registers as before, unverified", async () => {
    const res = await register("Gestor", attestedResponse(GOOD, "none"), GOOD);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "unverified", authenticatorName: null });
  });

  it("a compromised model is refused and nothing is saved", async () => {
    const before = (await list()).length;
    const res = await register("Mala", attestedResponse(BAD), BAD);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PASSKEY_AUTHENTICATOR_COMPROMISED");
    expect(await list()).toHaveLength(before);
  });
});
