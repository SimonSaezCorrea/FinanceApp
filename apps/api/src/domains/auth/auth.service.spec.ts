import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service";
import type { AuthRepository } from "./auth.repository";

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ana Bravo",
    passwordHash: "irrelevant",
    preferredCurrency: "CLP",
    locale: "es",
    dateFormat: "DD/MM/YYYY",
    theme: "dark",
    status: "ACTIVE",
    createdAt: new Date("2024-03-15T00:00:00Z"),
    countryId: null,
    country: null,
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

const SECRETS: Record<string, string> = {
  JWT_ACCESS_SECRET: "test-access",
  JWT_REFRESH_SECRET: "test-refresh",
};

function makeService(repo: Partial<AuthRepository>) {
  const config = { getOrThrow: (k: string) => SECRETS[k], get: () => undefined };
  return new AuthService(repo as AuthRepository, new JwtService({}), config as never);
}

describe("AuthService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("register hashes the password and rejects duplicates", async () => {
    const create = vi.fn().mockResolvedValue({ id: "u1", email: "a@b.com", name: null });
    const svc = makeService({ findByEmail: vi.fn().mockResolvedValue(null), create });

    const user = await svc.register({ email: "A@B.com", password: "password123" });

    expect(user).toEqual({ id: "u1", email: "a@b.com" });
    const arg = create.mock.calls[0]![0] as { email: string; passwordHash: string };
    expect(arg.email).toBe("a@b.com"); // lowercased
    expect(arg.passwordHash).not.toBe("password123"); // hashed
  });

  it("register throws ConflictException when email exists", async () => {
    const svc = makeService({ findByEmail: vi.fn().mockResolvedValue({ id: "x" }) });
    await expect(
      svc.register({ email: "a@b.com", password: "password123" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("validateCredentials accepts a correct password and rejects a wrong one", async () => {
    const passwordHash = await hash("secret123", 1);
    const svc = makeService({
      findByEmail: vi.fn().mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash }),
    });

    await expect(
      svc.validateCredentials({ email: "a@b.com", password: "secret123" }),
    ).resolves.toEqual({ id: "u1", email: "a@b.com" });
    await expect(
      svc.validateCredentials({ email: "a@b.com", password: "wrong" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("issues tokens and rotates them from a valid refresh token", async () => {
    const svc = makeService({
      findById: vi.fn().mockResolvedValue({ id: "u1", email: "a@b.com" }),
    });
    const { accessToken, refreshToken } = svc.issueTokens({ id: "u1", email: "a@b.com" });
    expect(accessToken).toBeTypeOf("string");

    const rotated = await svc.rotateFromRefresh(refreshToken);
    expect(rotated.accessToken).toBeTypeOf("string");
    expect(rotated.refreshToken).toBeTypeOf("string");
  });

  it("rejects a missing refresh token", async () => {
    const svc = makeService({});
    await expect(svc.rotateFromRefresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // US1 — Ver mi perfil
  it("getCurrentUser derives memberSinceYear from createdAt", async () => {
    const svc = makeService({
      findById: vi
        .fn()
        .mockResolvedValue(baseUser({ createdAt: new Date("2022-11-01T00:00:00Z") })),
    });
    const user = await svc.getCurrentUser("u1");
    expect(user.memberSinceYear).toBe(2022);
    expect(user.preferredCurrency).toBe("CLP");
  });

  it("getCurrentUser exposes the country name (not just the id), a computed age, and birthDate as a plain ISO date string", async () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const svc = makeService({
      findById: vi.fn().mockResolvedValue(
        baseUser({
          countryId: "country-cl",
          country: { id: "country-cl", name: "Chile" },
          birthDate: tenYearsAgo,
        }),
      ),
    });
    const user = await svc.getCurrentUser("u1");
    expect(user.countryId).toBe("country-cl");
    expect(user.countryName).toBe("Chile");
    expect(user.age).toBe(10);
    expect(user.birthDate).toBe(tenYearsAgo.toISOString().slice(0, 10));
  });

  it("getCurrentUser returns null country/age when unset", async () => {
    const svc = makeService({ findById: vi.fn().mockResolvedValue(baseUser()) });
    const user = await svc.getCurrentUser("u1");
    expect(user.countryName).toBeNull();
    expect(user.age).toBeNull();
  });

  // US2 — Editar nombre y email
  describe("updateProfile", () => {
    it("rejects an email already taken by another account", async () => {
      const svc = makeService({
        findByEmail: vi.fn().mockResolvedValue(baseUser({ id: "other-user" })),
      });
      await expect(svc.updateProfile("u1", { email: "taken@b.com" })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("accepts renaming to the user's own current email (no-op, not a conflict)", async () => {
      const update = vi.fn().mockResolvedValue(undefined);
      const svc = makeService({
        findByEmail: vi.fn().mockResolvedValue(baseUser({ id: "u1" })),
        findById: vi.fn().mockResolvedValue(baseUser()),
        update,
      });
      await expect(svc.updateProfile("u1", { email: "a@b.com" })).resolves.toBeDefined();
      expect(update).toHaveBeenCalled();
    });

    it("accepts a valid rename", async () => {
      const update = vi.fn().mockResolvedValue(undefined);
      const svc = makeService({
        findByEmail: vi.fn().mockResolvedValue(null),
        findById: vi.fn().mockResolvedValue(baseUser({ name: "New Name" })),
        update,
      });
      const user = await svc.updateProfile("u1", { name: "New Name" });
      expect(user.name).toBe("New Name");
      expect(update).toHaveBeenCalledWith("u1", expect.objectContaining({ name: "New Name" }));
    });

    it("persists country/address/birthDate/identifier fields", async () => {
      const update = vi.fn().mockResolvedValue(undefined);
      const birthDate = new Date("1990-05-14T00:00:00Z");
      const svc = makeService({
        findById: vi.fn().mockResolvedValue(
          baseUser({
            countryId: "country-cl",
            country: { id: "country-cl", name: "Chile" },
            addressStreet: "Av. Siempre Viva 742",
            identifierType: "RUT",
            identifierValue: "12345678-5",
            birthDate,
          }),
        ),
        update,
      });
      const user = await svc.updateProfile("u1", {
        countryId: "country-cl",
        addressStreet: "Av. Siempre Viva 742",
        identifierType: "RUT",
        identifierValue: "12345678-5",
        birthDate,
      });
      expect(update).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({
          countryId: "country-cl",
          addressStreet: "Av. Siempre Viva 742",
          identifierType: "RUT",
          identifierValue: "12345678-5",
          birthDate,
        }),
      );
      expect(user.countryName).toBe("Chile");
      expect(user.identifierValue).toBe("12345678-5");
    });

    it("maps a concurrent-write unique-constraint conflict to EMAIL_TAKEN (race-condition defense)", async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      });
      const svc = makeService({
        findByEmail: vi.fn().mockResolvedValue(null), // pre-check passes...
        update: vi.fn().mockRejectedValue(p2002), // ...but a concurrent write already took it
      });
      await expect(svc.updateProfile("u1", { email: "race@b.com" })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  // US3 — Cambiar contraseña
  describe("changePassword", () => {
    it("rejects an incorrect current password", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const svc = makeService({
        findById: vi.fn().mockResolvedValue(baseUser({ passwordHash })),
      });
      await expect(
        svc.changePassword("u1", { currentPassword: "wrong", newPassword: "newpassword123" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("persists a new hash when the current password is correct", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const update = vi.fn().mockResolvedValue(undefined);
      const svc = makeService({
        findById: vi.fn().mockResolvedValue(baseUser({ passwordHash })),
        update,
      });
      await svc.changePassword("u1", {
        currentPassword: "correct-pw",
        newPassword: "newpassword123",
      });
      const arg = update.mock.calls[0]![1] as { passwordHash: string };
      expect(arg.passwordHash).not.toBe(passwordHash);
      expect(await compare("newpassword123", arg.passwordHash)).toBe(true);
    });
  });

  // US4 — Preferencias persistidas
  it("updatePreferences persists a partial update and returns the refreshed user", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const svc = makeService({
      findById: vi.fn().mockResolvedValue(baseUser({ theme: "light", locale: "en" })),
      update,
    });
    const user = await svc.updatePreferences("u1", { theme: "light", locale: "en" });
    expect(update).toHaveBeenCalledWith("u1", { theme: "light", locale: "en" });
    expect(user.theme).toBe("light");
    expect(user.locale).toBe("en");
  });

  it("updatePreferences persists financial-customization fields (hideBalances, budget, cycle day, extra currencies)", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const svc = makeService({
      findById: vi.fn().mockResolvedValue(
        baseUser({
          hideBalances: true,
          monthlyBudgetTarget: new Prisma.Decimal("1200000"),
          billingCycleStartDay: 5,
          extraCurrencies: ["USD", "EUR"],
          budgetAlertThreshold: 90,
        }),
      ),
      update,
    });
    const user = await svc.updatePreferences("u1", {
      hideBalances: true,
      monthlyBudgetTarget: "1200000",
      billingCycleStartDay: 5,
      extraCurrencies: ["USD", "EUR"],
      budgetAlertThreshold: 90,
    });
    expect(update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        hideBalances: true,
        monthlyBudgetTarget: "1200000",
        billingCycleStartDay: 5,
        extraCurrencies: ["USD", "EUR"],
        budgetAlertThreshold: 90,
      }),
    );
    expect(user.hideBalances).toBe(true);
    expect(user.monthlyBudgetTarget).toBe("1200000.0000");
    expect(user.extraCurrencies).toEqual(["USD", "EUR"]);
  });

  it("getCurrentUser exposes phone and null monthlyBudgetTarget when unset", async () => {
    const svc = makeService({
      findById: vi.fn().mockResolvedValue(baseUser({ phone: "+56 9 1234 5678" })),
    });
    const user = await svc.getCurrentUser("u1");
    expect(user.phone).toBe("+56 9 1234 5678");
    expect(user.monthlyBudgetTarget).toBeNull();
    expect(user.budgetAlertThreshold).toBe(80);
  });

  // US5 — Desactivar mi cuenta
  describe("deactivate", () => {
    it("rejects an incorrect password and leaves the account untouched", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const update = vi.fn();
      const svc = makeService({
        findById: vi.fn().mockResolvedValue(baseUser({ passwordHash })),
        update,
      });
      await expect(svc.deactivate("u1", { password: "wrong" })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it("sets status=DISABLED and touches no other field (FR-011: no data is deleted or modified)", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const update = vi.fn().mockResolvedValue(undefined);
      const svc = makeService({
        findById: vi.fn().mockResolvedValue(baseUser({ passwordHash })),
        update,
      });
      await svc.deactivate("u1", { password: "correct-pw" });
      expect(update).toHaveBeenCalledWith("u1", { status: "DISABLED" });
    });

    it("rejects login and refresh-token rotation for a disabled account", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const disabledUser = baseUser({ passwordHash, status: "DISABLED" });
      const loginSvc = makeService({ findByEmail: vi.fn().mockResolvedValue(disabledUser) });
      await expect(
        loginSvc.validateCredentials({ email: "a@b.com", password: "correct-pw" }),
      ).rejects.toMatchObject({ response: { code: "ACCOUNT_DISABLED" } });

      const refreshSvc = makeService({ findById: vi.fn().mockResolvedValue(disabledUser) });
      const { refreshToken } = refreshSvc.issueTokens({ id: "u1", email: "a@b.com" });
      await expect(refreshSvc.rotateFromRefresh(refreshToken)).rejects.toMatchObject({
        response: { code: "ACCOUNT_DISABLED" },
      });
    });
  });
});
