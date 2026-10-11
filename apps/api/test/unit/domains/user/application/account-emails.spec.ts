import { describe, expect, it, vi } from "vitest";

import { AccountEmailService } from "../../../../../src/domains/user/application/account-emails";
import type { EmailTokenRepositoryPort } from "../../../../../src/domains/email-token/domain/ports/email-token.repository.port";
import type { EmailConfig } from "../../../../../src/infra/email/email.config";
import { DisabledEmailSender } from "../../../../../src/infra/email/senders/disabled-email.sender";
import {
  InMemoryEmailSender,
  tokenFrom,
} from "../../../../../src/infra/email/senders/in-memory-email.sender";

const config = {
  publicSiteUrl: "https://mifik.cl",
  replyTo: "contacto@mifik.cl",
} as EmailConfig;

function tokens(overrides: Partial<EmailTokenRepositoryPort> = {}): EmailTokenRepositoryPort {
  return {
    issue: vi.fn().mockResolvedValue({ issued: true, id: "t1" }),
    countSince: vi.fn().mockResolvedValue(0),
    findActive: vi.fn().mockResolvedValue(null),
    consumeWithTx: vi.fn(),
    revokeActiveWithTx: vi.fn(),
    deleteAllForUserWithTx: vi.fn(),
    purgeStale: vi.fn(),
    ...overrides,
  } as EmailTokenRepositoryPort;
}

const recipient = { userId: "u1", locale: "en" };
const email = { id: "e1", address: "ana@test.local" };

describe("AccountEmailService", () => {
  it("sends a link on the public site in the account's language, storing only its hash", async () => {
    const outbox = new InMemoryEmailSender();
    const repo = tokens();
    const service = new AccountEmailService(outbox, config, repo);

    expect(await service.sendVerification(recipient, email)).toBe("sent");
    const sent = outbox.last("ana@test.local", "verify-email")!;
    expect(sent.text).toContain("https://mifik.cl/en/verify-email/?token=");
    const token = tokenFrom(sent)!;
    const plan = vi.mocked(repo.issue).mock.calls[0]![0];
    expect(plan.tokenHash).not.toBe(token);
    expect(plan.userEmailId).toBe("e1");
  });

  it("is inert without a provider and never throws", async () => {
    const service = new AccountEmailService(new DisabledEmailSender(), config, tokens());
    expect(service.available).toBe(false);
    expect(await service.sendPasswordReset(recipient, "ana@test.local")).toBe("unavailable");
  });

  it("reuses a link sent less than a minute ago for the same address", async () => {
    const outbox = new InMemoryEmailSender();
    const repo = tokens({
      findActive: vi.fn().mockResolvedValue({ createdAt: new Date(), userEmailId: "e1" }),
    });
    const service = new AccountEmailService(outbox, config, repo);
    expect(await service.sendVerification(recipient, email)).toBe("recent");
    expect(outbox.sent).toHaveLength(0);
  });

  it("stops at five links an hour", async () => {
    const service = new AccountEmailService(
      new InMemoryEmailSender(),
      config,
      tokens({ countSince: vi.fn().mockResolvedValue(5) }),
    );
    expect(await service.sendPasswordReset(recipient, "ana@test.local")).toBe("rate-limited");
  });

  it("reports a failed delivery instead of throwing", async () => {
    const outbox = new InMemoryEmailSender();
    outbox.failNext = true;
    const service = new AccountEmailService(outbox, config, tokens());
    expect(await service.sendPasswordReset(recipient, "ana@test.local")).toBe("failed");
  });
});
