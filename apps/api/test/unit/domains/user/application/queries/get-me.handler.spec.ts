import { describe, expect, it, vi } from "vitest";

import { GetMeQueryHandler } from "../../../../../../src/domains/user/application/queries/get-me.handler";
import { GetMeQuery } from "../../../../../../src/domains/user/application/queries/get-me.query";
import { UnauthorizedError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";

function baseProps(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ana Bravo",
    passwordHash: "hashed",
    status: "ACTIVE",
    preferredCurrency: "CLP",
    locale: "es",
    dateFormat: "DD/MM/YYYY",
    theme: "dark",
    createdAt: new Date("2022-11-01T00:00:00Z"),
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

describe("GetMeQueryHandler", () => {
  it("returns the user's contract shape", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const handler = new GetMeQueryHandler(repo);
    const result = await handler.execute(new GetMeQuery("u1"));
    expect(result.memberSinceYear).toBe(2022);
    expect(result.preferredCurrency).toBe("CLP");
  });

  it("throws UNAUTHORIZED when the user no longer exists", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const handler = new GetMeQueryHandler(repo);
    await expect(handler.execute(new GetMeQuery("gone"))).rejects.toThrow(UnauthorizedError);
  });
});
