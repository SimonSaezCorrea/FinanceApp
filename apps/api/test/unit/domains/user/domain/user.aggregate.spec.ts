import { describe, expect, it } from "vitest";

import { AccountDisabledError } from "../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../src/domains/user/domain/user.aggregate";

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

describe("User aggregate", () => {
  it("assertActive() is a no-op for an ACTIVE account", () => {
    const user = User.fromPersistence(baseProps({ status: "ACTIVE" }));
    expect(() => user.assertActive()).not.toThrow();
  });

  it("assertActive() throws ACCOUNT_DISABLED for a DISABLED account", () => {
    const user = User.fromPersistence(baseProps({ status: "DISABLED" }));
    expect(() => user.assertActive()).toThrow(AccountDisabledError);
  });

  it("toContract() derives memberSinceYear from createdAt", () => {
    const user = User.fromPersistence(baseProps({ createdAt: new Date("2022-11-01T00:00:00Z") }));
    expect(user.toContract().memberSinceYear).toBe(2022);
  });

  it("toContract() computes age from birthDate and formats it as YYYY-MM-DD", () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const user = User.fromPersistence(
      baseProps({ birthDate: tenYearsAgo, countryId: "cl", countryName: "Chile" }),
    );
    const contract = user.toContract();
    expect(contract.age).toBe(10);
    expect(contract.birthDate).toBe(tenYearsAgo.toISOString().slice(0, 10));
    expect(contract.countryName).toBe("Chile");
  });

  it("toContract() returns null age/countryName/monthlyBudgetTarget when unset", () => {
    const user = User.fromPersistence(baseProps());
    const contract = user.toContract();
    expect(contract.age).toBeNull();
    expect(contract.countryName).toBeNull();
    expect(contract.monthlyBudgetTarget).toBeNull();
  });

  it("applyProfileUpdate() sets fields and derives countryName only when countryId changes", () => {
    const user = User.fromPersistence(baseProps());
    user.applyProfileUpdate({ name: "New Name", countryId: "cl", countryName: "Chile" });
    const contract = user.toContract();
    expect(contract.name).toBe("New Name");
    expect(contract.countryId).toBe("cl");
    expect(contract.countryName).toBe("Chile");
  });

  it("applyProfileUpdate() clears countryName when countryId is explicitly cleared", () => {
    const user = User.fromPersistence(baseProps({ countryId: "cl", countryName: "Chile" }));
    user.applyProfileUpdate({ countryId: null });
    const contract = user.toContract();
    expect(contract.countryId).toBeNull();
    expect(contract.countryName).toBeNull();
  });

  it("applyPreferencesUpdate() persists financial-customization fields", () => {
    const user = User.fromPersistence(baseProps());
    user.applyPreferencesUpdate({
      hideBalances: true,
      monthlyBudgetTarget: "1200000",
      billingCycleStartDay: 5,
      extraCurrencies: ["USD", "EUR"],
      budgetAlertThreshold: 90,
    });
    const contract = user.toContract();
    expect(contract.hideBalances).toBe(true);
    expect(contract.monthlyBudgetTarget).toBe("1200000.0000");
    expect(contract.extraCurrencies).toEqual(["USD", "EUR"]);
    expect(contract.budgetAlertThreshold).toBe(90);
  });

  it("changePasswordHash() replaces the stored hash", () => {
    const user = User.fromPersistence(baseProps({ passwordHash: "old" }));
    user.changePasswordHash("new-hash");
    expect(user.passwordHash).toBe("new-hash");
  });

  describe("deactivate()", () => {
    it("flips ACTIVE -> DISABLED and emits UserDeactivatedEvent", () => {
      const user = User.fromPersistence(baseProps({ status: "ACTIVE" }));
      const event = user.deactivate();
      expect(user.status).toBe("DISABLED");
      expect(event).not.toBeNull();
      expect(event?.userId).toBe("u1");
    });

    it("is idempotent: deactivating an already-DISABLED account emits no event", () => {
      const user = User.fromPersistence(baseProps({ status: "DISABLED" }));
      const event = user.deactivate();
      expect(event).toBeNull();
    });

    it("touches no other field (FR-011: no data is deleted or modified)", () => {
      const user = User.fromPersistence(baseProps({ name: "Ana Bravo", email: "a@b.com" }));
      user.deactivate();
      const contract = user.toContract();
      expect(contract.name).toBe("Ana Bravo");
      expect(contract.email).toBe("a@b.com");
    });
  });
});
