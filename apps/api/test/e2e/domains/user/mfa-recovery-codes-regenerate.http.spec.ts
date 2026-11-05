import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { appWithOutbox, waitForEmail } from "../../support/email-outbox";
import {
  enableTotp,
  login,
  registerConfirmed,
  stepUpTotp,
  totpCodeFor,
  verifyMfa,
  type TestAccount,
} from "../../support/mfa";

/** E2E (specs/040 US1): new recovery codes without turning MFA off. */
describe("Regenerate recovery codes HTTP (e2e)", () => {
  let app: INestApplication;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  let account: TestAccount;
  let secret: string;
  let oldCodes: string[];

  const regenerate = (cookies: string[]) =>
    request(app.getHttpServer()).post("/api/v1/auth/me/mfa/recovery-codes").set("Cookie", cookies);

  beforeAll(async () => {
    ({ app, outbox } = await appWithOutbox());
    prisma = app.get(PrismaService);
    account = await registerConfirmed(app, outbox, "regen");
    ({ secret, recoveryCodes: oldCodes } = await enableTotp(app, account.cookies));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: account.email } });
    await app.close();
  });

  it("refuses without a recent step-up", async () => {
    const res = await regenerate(account.cookies);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("STEP_UP_REQUIRED");
  });

  it("returns 10 new codes once per step-up; old ones die, new ones and the app work", async () => {
    expect((await stepUpTotp(app, account.cookies, secret)).status).toBe(200);
    const res = await regenerate(account.cookies);
    expect(res.status).toBe(201);
    const newCodes = res.body.recoveryCodes as string[];
    expect(newCodes).toHaveLength(10);

    // The step-up was spent: a replay is refused and creates nothing.
    const replay = await regenerate(account.cookies);
    expect(replay.status).toBe(403);

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", account.cookies);
    expect(me.body.mfaRecoveryCodesRemaining).toBe(10);

    const withOld = await login(app, account.rut);
    expect((await verifyMfa(app, withOld.cookies, oldCodes[0]!)).status).toBe(401);
    const withNew = await login(app, account.rut);
    expect((await verifyMfa(app, withNew.cookies, newCodes[0]!)).status).toBe(200);
    const withApp = await login(app, account.rut);
    expect((await verifyMfa(app, withApp.cookies, totpCodeFor(secret))).status).toBe(200);

    await waitForEmail(outbox, account.email, "security-notice", "códigos de recuperación nuevos");
  });

  it("two concurrent requests on one step-up produce exactly one set", async () => {
    await new Promise((r) => setTimeout(r, 1100)); // a fresh TOTP window isn't needed, only a new stamp
    expect((await stepUpTotp(app, account.cookies, secret)).status).toBe(200);
    const [a, b] = await Promise.all([regenerate(account.cookies), regenerate(account.cookies)]);
    expect([a.status, b.status].sort()).toEqual([201, 403]);
  });
});
