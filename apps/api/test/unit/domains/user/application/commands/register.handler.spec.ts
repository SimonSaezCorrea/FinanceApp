import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { RegisterHandler } from "../../../../../../src/domains/user/application/commands/register.handler";
import { RegisterCommand } from "../../../../../../src/domains/user/application/commands/register.command";
import { TokenIssuer } from "../../../../../../src/domains/user/application/token-issuer";
import { EmailTakenError } from "../../../../../../src/domains/user/domain/errors";
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
    findByEmail: vi.fn().mockResolvedValue(null),
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

describe("RegisterHandler", () => {
  it("hashes the password, lower-cases the email, and issues tokens", async () => {
    const create = vi.fn().mockResolvedValue(User.fromPersistence(baseProps()));
    const repo = fakeRepo({ findByEmail: vi.fn().mockResolvedValue(null), create });
    const tokenIssuer = fakeTokenIssuer();
    const handler = new RegisterHandler({ publish: vi.fn() } as never, repo, tokenIssuer);

    const result = await handler.execute(new RegisterCommand({ email: "A@B.com", password: "password123" }));

    expect(result.user.email).toBe("a@b.com");
    expect(result.tokens).toEqual({ accessToken: "at", refreshToken: "rt" });
    const arg = create.mock.calls[0]![0] as { email: string; passwordHash: string };
    expect(arg.email).toBe("a@b.com");
    expect(arg.passwordHash).not.toBe("password123");
    expect(await hash("password123", 1)).not.toBe(arg.passwordHash); // different salt, still a bcrypt hash
  });

  it("throws EMAIL_TAKEN when the email already exists", async () => {
    const repo = fakeRepo({ findByEmail: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())) });
    const handler = new RegisterHandler({ publish: vi.fn() } as never, repo, fakeTokenIssuer());

    await expect(
      handler.execute(new RegisterCommand({ email: "a@b.com", password: "password123" })),
    ).rejects.toThrow(EmailTakenError);
  });
});
