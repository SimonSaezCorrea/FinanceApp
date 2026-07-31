import { describe, expect, it, vi } from "vitest";

import { UpdateProfileHandler } from "../../../../../../src/domains/user/application/commands/update-profile.handler";
import { UpdateProfileCommand } from "../../../../../../src/domains/user/application/commands/update-profile.command";
import {
  EmailTakenError,
  UnauthorizedError,
} from "../../../../../../src/domains/user/domain/errors";
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
    findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    create: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    countryName: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("UpdateProfileHandler", () => {
  it("throws UNAUTHORIZED when the user no longer exists", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const handler = new UpdateProfileHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new UpdateProfileCommand("gone", { name: "X" }))).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("rejects an email already taken by another account", async () => {
    const repo = fakeRepo({
      findByEmail: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ id: "other-user" }))),
    });
    const handler = new UpdateProfileHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new UpdateProfileCommand("u1", { email: "taken@b.com" })),
    ).rejects.toThrow(EmailTakenError);
  });

  it("accepts renaming to the user's own current email (no-op, not a conflict)", async () => {
    const repo = fakeRepo({
      findByEmail: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ id: "u1" }))),
    });
    const handler = new UpdateProfileHandler({ publish: vi.fn() } as never, repo);
    const result = await handler.execute(new UpdateProfileCommand("u1", { email: "a@b.com" }));
    expect(result.email).toBe("a@b.com");
    expect(repo.save).toHaveBeenCalled();
  });

  it("resolves the linked country's name when countryId is set", async () => {
    const repo = fakeRepo({ countryName: vi.fn().mockResolvedValue("Chile") });
    const handler = new UpdateProfileHandler({ publish: vi.fn() } as never, repo);
    const result = await handler.execute(new UpdateProfileCommand("u1", { countryId: "cl" }));
    expect(result.countryId).toBe("cl");
    expect(result.countryName).toBe("Chile");
  });

  it("persists a valid rename", async () => {
    const repo = fakeRepo();
    const handler = new UpdateProfileHandler({ publish: vi.fn() } as never, repo);
    const result = await handler.execute(new UpdateProfileCommand("u1", { name: "New Name" }));
    expect(result.name).toBe("New Name");
    expect(repo.save).toHaveBeenCalled();
  });
});
