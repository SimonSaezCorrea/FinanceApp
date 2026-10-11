import { describe, expect, it, vi } from "vitest";

import type { AccountEmailService } from "../../../../../../src/domains/user/application/account-emails";
import { SendSecurityNoticeListener } from "../../../../../../src/domains/user/application/listeners/send-security-notice.listener";
import { AccountSecurityEvent } from "../../../../../../src/domains/user/domain/events/account-security.event";

function setup(found: unknown) {
  const sendSecurityNotice = vi.fn().mockResolvedValue(undefined);
  const listener = new SendSecurityNoticeListener(
    { findById: vi.fn().mockResolvedValue(found) } as never,
    { sendSecurityNotice } as unknown as AccountEmailService,
  );
  return { listener, sendSecurityNotice };
}

const at = new Date("2026-10-10T12:00:00Z");

describe("SendSecurityNoticeListener", () => {
  it("sends the notice to the account's confirmed address, in its language", async () => {
    const { listener, sendSecurityNotice } = setup({
      email: "ana@test.local",
      emailVerified: true,
      locale: "en",
    });
    await listener.notify(new AccountSecurityEvent("u1", "MFA_ENABLED", at));
    expect(sendSecurityNotice).toHaveBeenCalledWith({
      to: "ana@test.local",
      locale: "en",
      kind: "MFA_ENABLED",
      occurredAt: at,
      detail: undefined,
    });
  });

  it("sends nothing to an unconfirmed address", async () => {
    const { listener, sendSecurityNotice } = setup({
      email: "ana@test.local",
      emailVerified: false,
      locale: "es",
    });
    await listener.notify(new AccountSecurityEvent("u1", "PASSWORD_CHANGED", at));
    expect(sendSecurityNotice).not.toHaveBeenCalled();
  });

  it("uses the recipient carried by the event (old address, deleted account)", async () => {
    const { listener, sendSecurityNotice } = setup(null);
    await listener.notify(
      new AccountSecurityEvent("u1", "EMAIL_CHANGED", at, "new@test.local", {
        address: "old@test.local",
        locale: "es",
        verified: true,
      }),
    );
    expect(sendSecurityNotice).toHaveBeenCalledWith(
      expect.objectContaining({ to: "old@test.local", detail: "new@test.local" }),
    );

    sendSecurityNotice.mockClear();
    await listener.notify(
      new AccountSecurityEvent("u1", "EMAIL_CHANGED", at, undefined, {
        address: "old@test.local",
        locale: "es",
        verified: false,
      }),
    );
    expect(sendSecurityNotice).not.toHaveBeenCalled();
  });

  it("never lets a failing email reach the publisher", () => {
    const listener = new SendSecurityNoticeListener(
      { findById: vi.fn().mockRejectedValue(new Error("db down")) } as never,
      { sendSecurityNotice: vi.fn() } as unknown as AccountEmailService,
    );
    expect(() =>
      listener.handle(new AccountSecurityEvent("u1", "PASSWORD_CHANGED", at)),
    ).not.toThrow();
  });
});
