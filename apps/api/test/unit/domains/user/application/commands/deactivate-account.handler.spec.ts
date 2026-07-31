import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { DeactivateAccountHandler } from "../../../../../../src/domains/user/application/commands/deactivate-account.handler";
import { DeactivateAccountCommand } from "../../../../../../src/domains/user/application/commands/deactivate-account.command";
import { InvalidCurrentPasswordError } from "../../../../../../src/domains/user/domain/errors";
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
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    countryName: vi.fn(),
    ...overrides,
  };
}

describe("DeactivateAccountHandler", () => {
  it("rejects an incorrect password and leaves the account untouched", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))) });
    const handler = new DeactivateAccountHandler({ publish: vi.fn() } as never, repo);

    await expect(
      handler.execute(new DeactivateAccountCommand("u1", { password: "wrong" })),
    ).rejects.toThrow(InvalidCurrentPasswordError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("sets status=DISABLED and touches no other field (FR-011)", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))) });
    const handler = new DeactivateAccountHandler({ publish: vi.fn() } as never, repo);

    await handler.execute(new DeactivateAccountCommand("u1", { password: "correct-pw" }));

    expect(repo.save).toHaveBeenCalledTimes(1);
    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as User;
    expect(saved.status).toBe("DISABLED");
    expect(saved.name).toBe("Ana Bravo");
    expect(saved.email).toBe("a@b.com");
  });

  it("publishes UserDeactivatedEvent on a genuine ACTIVE -> DISABLED transition", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))) });
    const publish = vi.fn();
    const handler = new DeactivateAccountHandler({ publish } as never, repo);

    await handler.execute(new DeactivateAccountCommand("u1", { password: "correct-pw" }));

    expect(publish).toHaveBeenCalledTimes(1);
  });
});
