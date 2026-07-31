import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { LoginHandler } from "../../../../../../src/domains/user/application/commands/login.handler";
import { LoginCommand } from "../../../../../../src/domains/user/application/commands/login.command";
import { TokenIssuer } from "../../../../../../src/domains/user/application/token-issuer";
import { AccountDisabledError, InvalidCredentialsError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";

function baseProps(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: "u1",
    email: "a@b.com",
    name: null,
    passwordHash: "hashed",
    status: "ACTIVE",
    preferredCurrency: "CLP",
    locale: "es",
    dateFormat: "DD/MM/YYYY",
    theme: "dark",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    countryId: null,
    countryName: null,
    addressStreet: null,
    addressCity: null,
    addressRegion: null,
    addressPostalCode: null,
    birthDate: null,
    identifierType: null,
    identifierValue: null,
    phone: null,
    hideBalances: false,
    monthlyBudgetTarget: null,
    billingCycleStartDay: null,
    extraCurrencies: [],
    budgetAlertThreshold: 80,
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<UserRepositoryPort> = {}): UserRepositoryPort {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    countryName: vi.fn(),
    ...overrides,
  };
}

function fakeTokenIssuer(): TokenIssuer {
  return {
    issue: vi.fn().mockReturnValue({ accessToken: "at", refreshToken: "rt" }),
    verifyRefresh: vi.fn(),
  } as unknown as TokenIssuer;
}

describe("LoginHandler", () => {
  it("accepts a correct password and issues tokens", async () => {
    const passwordHash = await hash("secret123", 1);
    const repo = fakeRepo({ findByEmail: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))) });
    const handler = new LoginHandler({ publish: vi.fn() } as never, repo, fakeTokenIssuer());

    const result = await handler.execute(new LoginCommand({ email: "a@b.com", password: "secret123" }));
    expect(result.user.email).toBe("a@b.com");
    expect(result.tokens.accessToken).toBe("at");
  });

  it("rejects a wrong password with INVALID_CREDENTIALS", async () => {
    const passwordHash = await hash("secret123", 1);
    const repo = fakeRepo({ findByEmail: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))) });
    const handler = new LoginHandler({ publish: vi.fn() } as never, repo, fakeTokenIssuer());

    await expect(
      handler.execute(new LoginCommand({ email: "a@b.com", password: "wrong" })),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects an unknown email with INVALID_CREDENTIALS (no user-enumeration)", async () => {
    const repo = fakeRepo({ findByEmail: vi.fn().mockResolvedValue(null) });
    const handler = new LoginHandler({ publish: vi.fn() } as never, repo, fakeTokenIssuer());

    await expect(
      handler.execute(new LoginCommand({ email: "nobody@b.com", password: "whatever" })),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects a DISABLED account with ACCOUNT_DISABLED even with the correct password", async () => {
    const passwordHash = await hash("secret123", 1);
    const repo = fakeRepo({
      findByEmail: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash, status: "DISABLED" }))),
    });
    const handler = new LoginHandler({ publish: vi.fn() } as never, repo, fakeTokenIssuer());

    await expect(
      handler.execute(new LoginCommand({ email: "a@b.com", password: "secret123" })),
    ).rejects.toThrow(AccountDisabledError);
  });
});
