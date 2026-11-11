import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { LoginHandler } from "../../../../../../src/domains/user/application/commands/login.handler";
import { LoginCommand } from "../../../../../../src/domains/user/application/commands/login.command";
import { SessionIssuer } from "../../../../../../src/domains/user/application/session-issuer";
import { TokenIssuer } from "../../../../../../src/domains/user/application/token-issuer";
import {
  AccountDisabledError,
  InvalidCredentialsError,
  LoginLockedError,
} from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";
import { fakeMfaCodes, fakeTrustedDevices } from "../../../../support/fake-ports";

function baseProps(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: "u1",
    email: "a@b.com",
    name: null,
    passwordHash: "hashed",
    status: "ACTIVE",
    deletedAt: null,
    preferredCurrency: "CLP",
    locale: "es",
    theme: "dark",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    countryId: null,
    countryName: null,
    addressStreet: null,
    addressCity: null,
    addressRegion: null,
    addressPostalCode: null,
    birthDate: null,
    identifierType: "RUT",
    identifierValue: "123456785",
    phone: null,
    hideBalances: false,
    extraCurrencies: [],
    budgetAlertThreshold: 80,
    mfaEnabled: false,
    mfaSecret: null,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    loginFailedAttempts: 0,
    loginLockedUntil: null,
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<UserRepositoryPort> = {}): UserRepositoryPort {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    saveFields: vi.fn().mockResolvedValue(undefined),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn(),
    findByIdentifierValue: vi.fn(),
    deleteWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeTokenIssuer(): TokenIssuer {
  return {
    issue: vi.fn().mockReturnValue({ accessToken: "at", refreshToken: "rt", sessionId: "s1" }),
    verifyRefresh: vi.fn(),
    issueMfaPending: vi.fn().mockReturnValue("pending-token"),
    verifyMfaPending: vi.fn(),
  } as unknown as TokenIssuer;
}

function fakeSessionIssuer(): SessionIssuer {
  return {
    establish: vi.fn().mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      sessionId: "s1",
      sessionExpiresAt: new Date("2024-01-08T00:00:00Z"),
    }),
  } as unknown as SessionIssuer;
}

/** The handler reads the user twice — once by RUT, once locked by id — so both return the same
 * aggregate, and the transaction just runs its callback. */
function makeHandler(
  user: User | null,
  deps: {
    tokenIssuer?: TokenIssuer;
    sessionIssuer?: SessionIssuer;
    devices?: ReturnType<typeof fakeTrustedDevices>;
    mfaCodes?: ReturnType<typeof fakeMfaCodes>;
  } = {},
) {
  const repo = fakeRepo({
    findByIdentifierValue: vi.fn().mockResolvedValue(user),
    findByIdForUpdateWithTx: vi.fn().mockResolvedValue(user),
    saveWithTx: vi.fn().mockResolvedValue(undefined),
    saveFields: vi.fn().mockResolvedValue(undefined),
  });
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as unknown as PrismaService;
  const tokenIssuer = deps.tokenIssuer ?? fakeTokenIssuer();
  const sessionIssuer = deps.sessionIssuer ?? fakeSessionIssuer();
  const handler = new LoginHandler(
    { publish: vi.fn() } as never,
    repo,
    tokenIssuer,
    sessionIssuer,
    prisma,
    deps.devices ?? fakeTrustedDevices(),
    deps.mfaCodes ?? fakeMfaCodes(),
  );
  return { handler, repo, tokenIssuer, sessionIssuer };
}

async function userWith(overrides: Partial<UserProps> = {}): Promise<User> {
  const passwordHash = await hash("secret123", 1);
  return User.fromPersistence(baseProps({ passwordHash, ...overrides }));
}

const attempt = (password: string, identifierValue = "123456785") =>
  new LoginCommand({ identifierValue, password });

describe("LoginHandler", () => {
  it("accepts a correct password and issues tokens", async () => {
    const { handler, repo } = makeHandler(await userWith());
    const result = await handler.execute(attempt("secret123", "12.345.678-5"));
    if (result.mfaRequired) throw new Error("expected a full session, got mfaRequired");
    expect(result.user.email).toBe("a@b.com");
    expect(result.tokens.accessToken).toBe("at");
    // Normalized (dots/dash stripped) before the lookup.
    expect(repo.findByIdentifierValue).toHaveBeenCalledWith("123456785");
    // A clean login writes nothing.
    expect(repo.saveWithTx).not.toHaveBeenCalled();
  });

  it("rejects a wrong password with INVALID_CREDENTIALS and counts it", async () => {
    const user = await userWith();
    const { handler, repo } = makeHandler(user);
    await expect(handler.execute(attempt("wrong"))).rejects.toThrow(InvalidCredentialsError);
    expect(user.snapshot().loginFailedAttempts).toBe(1);
    expect(repo.saveWithTx).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown RUT with INVALID_CREDENTIALS (no user-enumeration)", async () => {
    const { handler } = makeHandler(null);
    await expect(handler.execute(attempt("whatever", "999999990"))).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it("locks on the 5th wrong password in a row and answers LOGIN_LOCKED", async () => {
    const user = await userWith({ loginFailedAttempts: 4 });
    const { handler } = makeHandler(user);
    await expect(handler.execute(attempt("wrong"))).rejects.toThrow(LoginLockedError);
    expect(user.snapshot().loginLockedUntil).not.toBeNull();
  });

  it("refuses even the right password while locked, without counting it", async () => {
    const user = await userWith({
      loginFailedAttempts: 5,
      loginLockedUntil: new Date(Date.now() + 10 * 60_000),
    });
    const { handler, repo, sessionIssuer } = makeHandler(user);
    await expect(handler.execute(attempt("secret123"))).rejects.toThrow(LoginLockedError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
    expect(sessionIssuer.establish).not.toHaveBeenCalled();
  });

  it("an expired lock lets the right password in and resets the counter", async () => {
    const user = await userWith({
      loginFailedAttempts: 5,
      loginLockedUntil: new Date(Date.now() - 60_000),
    });
    const { handler, repo } = makeHandler(user);
    const result = await handler.execute(attempt("secret123"));
    expect(result.mfaRequired).toBe(false);
    expect(user.snapshot().loginFailedAttempts).toBe(0);
    expect(user.snapshot().loginLockedUntil).toBeNull();
    expect(repo.saveWithTx).toHaveBeenCalledTimes(1);
  });

  it("after an expired lock, one wrong password counts from zero and doesn't re-lock (run-2)", async () => {
    const user = await userWith({
      loginFailedAttempts: 5,
      loginLockedUntil: new Date(Date.now() - 60_000),
    });
    const { handler } = makeHandler(user);
    await expect(handler.execute(attempt("wrong"))).rejects.toThrow(InvalidCredentialsError);
    expect(user.snapshot().loginFailedAttempts).toBe(1);
    expect(user.snapshot().loginLockedUntil).toBeNull();
  });

  it("refuses without counting when the password changed between the check and the lock", async () => {
    const read = await userWith();
    const locked = User.fromPersistence({
      ...read.snapshot(),
      passwordHash: await hash("other", 1),
    });
    const { handler, repo } = makeHandler(read);
    vi.mocked(repo.findByIdForUpdateWithTx).mockResolvedValue(locked);
    await expect(handler.execute(attempt("secret123"))).rejects.toThrow(InvalidCredentialsError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
  });

  it("rejects a DISABLED account with ACCOUNT_DISABLED even with the correct password", async () => {
    const { handler } = makeHandler(await userWith({ status: "DISABLED" }));
    await expect(handler.execute(attempt("secret123"))).rejects.toThrow(AccountDisabledError);
  });

  it("does not issue a session for a user with MFA active — only a pending token", async () => {
    const { handler, tokenIssuer, sessionIssuer } = makeHandler(
      await userWith({ mfaEnabled: true }),
    );
    const result = await handler.execute(attempt("secret123"));
    if (!result.mfaRequired) throw new Error("expected mfaRequired, got a full session");
    expect(result.mfaPendingToken).toBe("pending-token");
    expect(tokenIssuer.issue).not.toHaveBeenCalled();
    expect(sessionIssuer.establish).not.toHaveBeenCalled();
  });
});

describe("LoginHandler — remembered device (specs/040 US2)", () => {
  const device = (userId: string, expiresAt = new Date(Date.now() + 86_400_000)) => ({
    id: "d1",
    userId,
    tokenHash: "h",
    deviceLabel: "Chrome · Windows",
    createdAt: new Date(),
    expiresAt,
    lastUsedAt: null,
  });

  it("skips the second factor on this account's own remembered browser, and touches it", async () => {
    const devices = fakeTrustedDevices({
      findValidByTokenHash: vi.fn().mockResolvedValue(device("u1")),
    });
    const { handler } = makeHandler(await userWith({ mfaEnabled: true, mfaMethod: "TOTP" }), {
      devices,
    });
    const result = await handler.execute(
      new LoginCommand({ identifierValue: "123456785", password: "secret123" }, undefined, "tok"),
    );
    expect(result.mfaRequired).toBe(false);
    expect(devices.touch).toHaveBeenCalledWith("d1", expect.any(Date));
  });

  it("asks for the second factor when the cookie belongs to another account", async () => {
    const devices = fakeTrustedDevices({
      findValidByTokenHash: vi.fn().mockResolvedValue(device("someone-else")),
    });
    const { handler } = makeHandler(await userWith({ mfaEnabled: true }), { devices });
    const result = await handler.execute(
      new LoginCommand({ identifierValue: "123456785", password: "secret123" }, undefined, "tok"),
    );
    expect(result.mfaRequired).toBe(true);
    expect(devices.touch).not.toHaveBeenCalled();
  });

  it("never skips the password: a wrong one is refused and counted even on a remembered browser", async () => {
    const devices = fakeTrustedDevices({
      findValidByTokenHash: vi.fn().mockResolvedValue(device("u1")),
    });
    const user = await userWith({ mfaEnabled: true });
    const { handler } = makeHandler(user, { devices });
    await expect(
      handler.execute(
        new LoginCommand({ identifierValue: "123456785", password: "wrong" }, undefined, "tok"),
      ),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(user.snapshot().loginFailedAttempts).toBe(1);
    expect(devices.findValidByTokenHash).not.toHaveBeenCalled();
  });
});
