import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { appWithOutbox } from "../../support/email-outbox";
import {
  PASSWORD,
  enableTotp,
  forgetStepUp,
  registerConfirmed,
  stepUpTotp,
} from "../../support/mfa";

/**
 * Security run-3: with a second factor, the session and the password are not enough to change the
 * password or delete the account — the session must have stepped up with that factor (an
 * infostealer that took a cookie and a saved password must still hit the second factor).
 */
describe("Change password and delete account need a step-up on a protected account (e2e)", () => {
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
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it("change password: 403 STEP_UP_REQUIRED without a step-up, 204 after a TOTP step-up", async () => {
    const account = await registerConfirmed(app, outbox, "stepup_change_pw");
    emails.push(account.email);
    const { secret } = await enableTotp(app, account.cookies);
    await forgetStepUp(prisma, account.email);

    const change = () =>
      request(app.getHttpServer())
        .post("/api/v1/auth/me/password")
        .set("Cookie", account.cookies)
        .send({ currentPassword: PASSWORD, newPassword: "An0therSecret!" });

    const refused = await change();
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("STEP_UP_REQUIRED");

    expect((await stepUpTotp(app, account.cookies, secret)).status).toBe(200);
    expect((await change()).status).toBe(204);
  });

  it("delete account: 403 STEP_UP_REQUIRED without a step-up, deleted after a TOTP step-up", async () => {
    const account = await registerConfirmed(app, outbox, "stepup_delete");
    emails.push(account.email);
    const { secret } = await enableTotp(app, account.cookies);
    await forgetStepUp(prisma, account.email);

    const remove = () =>
      request(app.getHttpServer())
        .post("/api/v1/auth/me/delete-account")
        .set("Cookie", account.cookies)
        .send({ password: PASSWORD });

    const refused = await remove();
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("STEP_UP_REQUIRED");
    expect(await prisma.user.count({ where: { email: account.email } })).toBe(1);

    expect((await stepUpTotp(app, account.cookies, secret)).status).toBe(200);
    expect((await remove()).status).toBe(204);
    expect(await prisma.user.count({ where: { email: account.email } })).toBe(0);
  });

  it("an account without a second factor still confirms with the password alone", async () => {
    const account = await registerConfirmed(app, outbox, "stepup_plain");
    emails.push(account.email);
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", account.cookies)
      .send({ currentPassword: PASSWORD, newPassword: "An0therSecret!" });
    expect(res.status).toBe(204);
  });
});
