import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { MfaCodeRepositoryPort } from "../../../../../src/domains/mfa-code/domain/ports/mfa-code.repository.port";
import type { MfaCodePlan } from "../../../../../src/domains/mfa-code/domain/mfa-code";
import { MfaCodeService } from "../../../../../src/domains/user/application/mfa-code-service";
import type { MfaCodeSenderPort } from "../../../../../src/domains/user/application/mfa-code-sender";
import {
  EmailUnavailableError,
  MfaCodeRateLimitedError,
  MfaEmailNotVerifiedError,
} from "../../../../../src/domains/user/domain/errors";

const recipient = { userId: "u1", email: "a@b.com", emailVerified: true, locale: "es" };

function setup(opts: { issued?: Date[]; available?: boolean; sendFails?: boolean } = {}) {
  const plans: MfaCodePlan[] = [];
  const codes: MfaCodeRepositoryPort = {
    issue: vi.fn(async (plan: MfaCodePlan) => {
      plans.push(plan);
      return { issued: true };
    }),
    issuedSince: vi.fn().mockResolvedValue(opts.issued ?? []),
    findActive: vi.fn(async () => {
      const plan = plans[plans.length - 1];
      return plan ? { ...plan, usedAt: null } : null;
    }),
    consumeWithTx: vi.fn().mockResolvedValue(true),
    revokeActiveWithTx: vi.fn(),
    purgeStale: vi.fn(),
  };
  const sent: { code: string; to: string; purpose: string }[] = [];
  const sender: MfaCodeSenderPort = {
    channel: "EMAIL",
    available: opts.available ?? true,
    send: vi.fn(async (m) => {
      if (opts.sendFails) throw new Error("provider down");
      sent.push(m);
    }),
  };
  const service = new MfaCodeService(
    codes,
    sender,
    new ConfigService({ MFA_ENCRYPTION_KEY: "unit-test-key" }),
  );
  return { service, codes, sent, plans };
}

describe("MfaCodeService (specs/040)", () => {
  it("sends a code to the confirmed email and stores only its HMAC", async () => {
    const { service, sent, plans } = setup();
    expect(await service.issueAndSend(recipient, "LOGIN")).toEqual({ sent: true });
    expect(sent[0]).toMatchObject({ to: "a@b.com", purpose: "LOGIN" });
    expect(sent[0]!.code).toMatch(/^\d{6}$/);
    expect(plans[0]!.codeHash).not.toContain(sent[0]!.code);
    expect(plans[0]!.channel).toBe("EMAIL");
  });

  it("never sends to an unconfirmed email", async () => {
    const { service, sent } = setup();
    const outcome = await service.issueAndSend({ ...recipient, emailVerified: false }, "LOGIN");
    expect(outcome).toEqual({ sent: false, reason: "not-verified" });
    expect(sent).toHaveLength(0);
    await expect(
      service.issueAndSendOrThrow({ ...recipient, emailVerified: false }, "ENROLL"),
    ).rejects.toThrow(MfaEmailNotVerifiedError);
  });

  it("holds a resend back for a minute, telling how long to wait", async () => {
    const { service, sent } = setup({ issued: [new Date(Date.now() - 20_000)] });
    const outcome = await service.issueAndSend(recipient, "LOGIN");
    expect(outcome).toMatchObject({ sent: false, reason: "rate-limited" });
    expect(sent).toHaveLength(0);
    const err = await service.issueAndSendOrThrow(recipient, "LOGIN").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MfaCodeRateLimitedError);
    expect((err as MfaCodeRateLimitedError).details.retryAfterSeconds).toBeGreaterThan(30);
  });

  it("logs a provider failure instead of throwing", async () => {
    const { service } = setup({ sendFails: true });
    expect(await service.issueAndSend(recipient, "LOGIN")).toEqual({
      sent: false,
      reason: "failed",
    });
  });

  it("answers 'unavailable' when email is off", async () => {
    const { service } = setup({ available: false });
    await expect(service.issueAndSendOrThrow(recipient, "STEP_UP")).rejects.toThrow(
      EmailUnavailableError,
    );
  });

  it("accepts the sent code once and refuses any other", async () => {
    const { service, sent, codes } = setup();
    await service.issueAndSend(recipient, "LOGIN");
    const code = sent[0]!.code;
    const wrong = code === "000000" ? "000001" : "000000";
    expect(await service.verifyWithTx({}, "u1", "LOGIN", wrong)).toBe(false);
    expect(codes.consumeWithTx).not.toHaveBeenCalled();
    expect(await service.verifyWithTx({}, "u1", "LOGIN", code)).toBe(true);
    expect(await service.verifyWithTx({}, "u1", "LOGIN", "ABCD-1234")).toBe(false);
  });
});
