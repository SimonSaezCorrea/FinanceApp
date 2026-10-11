import { describe, expect, it, vi } from "vitest";

import { ForgotPasswordHandler } from "../../../../../../src/domains/user/application/commands/forgot-password.handler";
import { RequestEmailChangeCommand } from "../../../../../../src/domains/user/application/commands/request-email-change.command";
import { RequestEmailChangeHandler } from "../../../../../../src/domains/user/application/commands/request-email-change.handler";
import { ResendVerificationCommand } from "../../../../../../src/domains/user/application/commands/resend-verification.command";
import { ResendVerificationHandler } from "../../../../../../src/domains/user/application/commands/resend-verification.handler";
import { ResetPasswordCommand } from "../../../../../../src/domains/user/application/commands/reset-password.command";
import { ResetPasswordHandler } from "../../../../../../src/domains/user/application/commands/reset-password.handler";
import { VerifyEmailCommand } from "../../../../../../src/domains/user/application/commands/verify-email.command";
import { VerifyEmailHandler } from "../../../../../../src/domains/user/application/commands/verify-email.handler";
import type {
  AccountEmailService,
  LinkOutcome,
} from "../../../../../../src/domains/user/application/account-emails";
import {
  EmailAlreadyPrimaryError,
  EmailAlreadyVerifiedError,
  EmailRateLimitedError,
  EmailTakenError,
  EmailTokenInvalidError,
  EmailUnavailableError,
} from "../../../../../../src/domains/user/domain/errors";
import type { AccountSecurityEvent } from "../../../../../../src/domains/user/domain/events/account-security.event";
import type { UserEmailProps } from "../../../../../../src/domains/user-email/domain/user-email.entity";

const TOKEN = "A".repeat(43);

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "ana@test.local",
    emailVerified: true,
    locale: "es",
    status: "ACTIVE",
    confirmPrimaryEmail: vi.fn(),
    resetPassword: vi.fn(),
    ...overrides,
  };
}

function address(overrides: Partial<UserEmailProps> = {}): UserEmailProps {
  return {
    id: "e1",
    userId: "u1",
    address: "ana@test.local",
    status: "PRIMARY",
    verifiedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    replacedAt: null,
    ...overrides,
  };
}

function accountEmails(outcome: LinkOutcome = "sent", available = true) {
  return {
    available,
    sendVerification: vi.fn().mockResolvedValue(outcome),
    sendPasswordReset: vi.fn().mockResolvedValue(outcome),
  } as unknown as AccountEmailService & {
    sendVerification: ReturnType<typeof vi.fn>;
    sendPasswordReset: ReturnType<typeof vi.fn>;
  };
}

/** A `$transaction` that hands the callback a stand-in client (`{}`). */
const prisma = { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } as never;

describe("VerifyEmailHandler", () => {
  function setup(target: UserEmailProps | null, consumed = true, previous?: UserEmailProps) {
    const u = user();
    const publish = vi.fn();
    const emails = {
      findById: vi.fn().mockResolvedValue(target),
      findPrimary: vi.fn().mockResolvedValue(previous ?? null),
      markVerifiedWithTx: vi.fn(),
      promotePendingWithTx: vi.fn(),
    };
    const tokens = {
      consumeWithTx: vi
        .fn()
        .mockResolvedValue(consumed ? { userId: "u1", userEmailId: target?.id ?? "e1" } : null),
    };
    const users = { findByIdForUpdateWithTx: vi.fn().mockResolvedValue(u), saveWithTx: vi.fn() };
    const handler = new VerifyEmailHandler(
      { publish } as never,
      users as never,
      emails as never,
      tokens as never,
      prisma,
    );
    return { handler, emails, publish, u };
  }

  it("confirms an unconfirmed primary in place, with no notice", async () => {
    const { handler, emails, u, publish } = setup(address());
    await handler.execute(new VerifyEmailCommand(TOKEN));
    expect(emails.markVerifiedWithTx).toHaveBeenCalled();
    expect(u.confirmPrimaryEmail).toHaveBeenCalledWith("ana@test.local", expect.any(Date));
    expect(publish).not.toHaveBeenCalled();
  });

  it("promotes a pending address and tells the previous confirmed one", async () => {
    const previous = address({ id: "e0", verifiedAt: new Date() });
    const pending = address({ id: "e2", address: "new@test.local", status: "PENDING" });
    const { handler, emails, publish } = setup(pending, true, previous);
    await handler.execute(new VerifyEmailCommand(TOKEN));
    expect(emails.promotePendingWithTx).toHaveBeenCalledWith({}, "u1", "e2", expect.any(Date));
    const event = publish.mock.calls[0]![0] as AccountSecurityEvent;
    expect(event.kind).toBe("EMAIL_CHANGED");
    expect(event.recipient).toEqual({ address: "ana@test.local", locale: "es", verified: true });
  });

  it("refuses a used, expired or replaced link", async () => {
    const { handler } = setup(address(), false);
    await expect(handler.execute(new VerifyEmailCommand(TOKEN))).rejects.toThrow(
      EmailTokenInvalidError,
    );
  });

  it("refuses a link whose address already left the registry", async () => {
    const { handler } = setup(address({ status: "PAST" }));
    await expect(handler.execute(new VerifyEmailCommand(TOKEN))).rejects.toThrow(
      EmailTokenInvalidError,
    );
  });
});

describe("ResendVerificationHandler", () => {
  function setup(
    pending: UserEmailProps | null,
    primary: UserEmailProps | null,
    outcome?: LinkOutcome,
  ) {
    const mail = accountEmails(outcome);
    const handler = new ResendVerificationHandler(
      { publish: vi.fn() } as never,
      { findById: vi.fn().mockResolvedValue(user()) } as never,
      {
        findPending: vi.fn().mockResolvedValue(pending),
        findPrimary: vi.fn().mockResolvedValue(primary),
      } as never,
      mail,
    );
    return { handler, mail };
  }

  it("resends to the pending address first", async () => {
    const pending = address({ id: "e2", status: "PENDING" });
    const { handler, mail } = setup(pending, address({ verifiedAt: new Date() }));
    await handler.execute(new ResendVerificationCommand("u1"));
    expect(mail.sendVerification).toHaveBeenCalledWith({ userId: "u1", locale: "es" }, pending);
  });

  it("answers EMAIL_ALREADY_VERIFIED when nothing is left to confirm", async () => {
    const { handler } = setup(null, address({ verifiedAt: new Date() }));
    await expect(handler.execute(new ResendVerificationCommand("u1"))).rejects.toThrow(
      EmailAlreadyVerifiedError,
    );
  });

  it("turns the send outcome into the matching error", async () => {
    await expect(
      setup(null, address(), "rate-limited").handler.execute(new ResendVerificationCommand("u1")),
    ).rejects.toThrow(EmailRateLimitedError);
    await expect(
      setup(null, address(), "unavailable").handler.execute(new ResendVerificationCommand("u1")),
    ).rejects.toThrow(EmailUnavailableError);
    await expect(
      setup(null, address(), "recent").handler.execute(new ResendVerificationCommand("u1")),
    ).resolves.toBeUndefined();
  });
});

describe("RequestEmailChangeHandler", () => {
  function setup(opts: { owner?: unknown; available?: boolean; existing?: UserEmailProps } = {}) {
    const mail = accountEmails("sent", opts.available ?? true);
    const emails = {
      findPending: vi.fn().mockResolvedValue(opts.existing ?? null),
      addPendingWithTx: vi
        .fn()
        .mockResolvedValue(address({ id: "e9", address: "new@test.local", status: "PENDING" })),
    };
    const handler = new RequestEmailChangeHandler(
      { publish: vi.fn() } as never,
      {
        findById: vi.fn().mockResolvedValue(user()),
        findByEmail: vi.fn().mockResolvedValue(opts.owner ?? null),
      } as never,
      emails as never,
      mail,
      prisma,
    );
    return { handler, emails, mail };
  }

  it("adds a pending address and sends its link", async () => {
    const { handler, emails, mail } = setup();
    const result = await handler.execute(new RequestEmailChangeCommand("u1", " New@Test.local "));
    expect(emails.addPendingWithTx).toHaveBeenCalledWith(
      {},
      "u1",
      "new@test.local",
      expect.any(Date),
    );
    expect(mail.sendVerification).toHaveBeenCalled();
    expect(result).toMatchObject({ address: "new@test.local", status: "PENDING" });
  });

  it("reuses a pending address asked for seconds ago", async () => {
    const existing = address({
      id: "e8",
      address: "new@test.local",
      status: "PENDING",
      createdAt: new Date(),
    });
    const { handler, emails } = setup({ existing });
    await handler.execute(new RequestEmailChangeCommand("u1", "new@test.local"));
    expect(emails.addPendingWithTx).not.toHaveBeenCalled();
  });

  it("refuses the current primary, another account's address, and a missing provider", async () => {
    await expect(
      setup().handler.execute(new RequestEmailChangeCommand("u1", "ANA@test.local")),
    ).rejects.toThrow(EmailAlreadyPrimaryError);
    await expect(
      setup({ owner: { id: "u2" } }).handler.execute(
        new RequestEmailChangeCommand("u1", "x@test.local"),
      ),
    ).rejects.toThrow(EmailTakenError);
    const unavailable = setup({ available: false });
    await expect(
      unavailable.handler.execute(new RequestEmailChangeCommand("u1", "x@test.local")),
    ).rejects.toThrow(EmailUnavailableError);
    expect(unavailable.emails.addPendingWithTx).not.toHaveBeenCalled();
  });
});

describe("ForgotPasswordHandler.recover", () => {
  function setup(found: unknown) {
    const mail = accountEmails();
    const handler = new ForgotPasswordHandler(
      { publish: vi.fn() } as never,
      { findByIdentifierValue: vi.fn().mockResolvedValue(found) } as never,
      mail,
    );
    return { handler, mail };
  }

  it("sends a link to a confirmed address", async () => {
    const { handler, mail } = setup(user());
    await handler.recover("12.345.678-5");
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(
      { userId: "u1", locale: "es" },
      "ana@test.local",
    );
  });

  it("sends nothing for a missing account, an unconfirmed address or a disabled account", async () => {
    for (const found of [null, user({ emailVerified: false }), user({ status: "DISABLED" })]) {
      const { handler, mail } = setup(found);
      await handler.recover("123456785");
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    }
  });
});

describe("ResetPasswordHandler", () => {
  function setup(consumed: boolean) {
    const u = user();
    const sessions = { closeAllForUserWithTx: vi.fn() };
    const users = { findByIdForUpdateWithTx: vi.fn().mockResolvedValue(u), saveWithTx: vi.fn() };
    const publish = vi.fn();
    const handler = new ResetPasswordHandler(
      { publish } as never,
      users as never,
      { consumeWithTx: vi.fn().mockResolvedValue(consumed ? { userId: "u1" } : null) } as never,
      sessions as never,
      prisma,
    );
    return { handler, u, sessions, users, publish };
  }

  it("sets the new password, closes every session and publishes PASSWORD_RESET", async () => {
    const { handler, u, sessions, users, publish } = setup(true);
    await handler.execute(new ResetPasswordCommand(TOKEN, "Nuev4Clave!x"));
    expect(u.resetPassword).toHaveBeenCalledWith(expect.stringMatching(/^\$2[aby]\$/));
    expect(users.saveWithTx).toHaveBeenCalled();
    expect(sessions.closeAllForUserWithTx).toHaveBeenCalledWith({}, "u1");
    expect((publish.mock.calls[0]![0] as AccountSecurityEvent).kind).toBe("PASSWORD_RESET");
  });

  it("refuses an invalid link and changes nothing", async () => {
    const { handler, sessions } = setup(false);
    await expect(handler.execute(new ResetPasswordCommand(TOKEN, "Nuev4Clave!x"))).rejects.toThrow(
      EmailTokenInvalidError,
    );
    expect(sessions.closeAllForUserWithTx).not.toHaveBeenCalled();
  });
});
