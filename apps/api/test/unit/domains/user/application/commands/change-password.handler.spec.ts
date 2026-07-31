import { compare, hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { ChangePasswordHandler } from "../../../../../../src/domains/user/application/commands/change-password.handler";
import { ChangePasswordCommand } from "../../../../../../src/domains/user/application/commands/change-password.command";
import { InvalidCurrentPasswordError } from "../../../../../../src/domains/user/domain/errors";
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
    save: vi.fn().mockResolvedValue(undefined),
    countryName: vi.fn(),
    ...overrides,
  };
}

describe("ChangePasswordHandler", () => {
  it("rejects an incorrect current password and never saves", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const handler = new ChangePasswordHandler({ publish: vi.fn() } as never, repo);

    await expect(
      handler.execute(
        new ChangePasswordCommand("u1", {
          currentPassword: "wrong",
          newPassword: "newpassword123",
        }),
      ),
    ).rejects.toThrow(InvalidCurrentPasswordError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("persists a new hash when the current password is correct", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const handler = new ChangePasswordHandler({ publish: vi.fn() } as never, repo);

    await handler.execute(
      new ChangePasswordCommand("u1", {
        currentPassword: "correct-pw",
        newPassword: "newpassword123",
      }),
    );

    expect(repo.save).toHaveBeenCalledTimes(1);
    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as User;
    expect(saved.passwordHash).not.toBe(passwordHash);
    expect(await compare("newpassword123", saved.passwordHash!)).toBe(true);
  });
});
