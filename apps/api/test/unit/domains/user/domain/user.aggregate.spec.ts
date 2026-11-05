import { describe, expect, it } from "vitest";

import {
  AccountDisabledError,
  MfaAlreadyEnabledError,
  MfaNotPendingError,
  MfaSameMethodError,
} from "../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../src/domains/user/domain/user.aggregate";

function baseProps(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ana Bravo",
    passwordHash: "hashed",
    status: "ACTIVE",
    deletedAt: null,
    preferredCurrency: "CLP",
    locale: "es",
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

  it("toContract() returns null age/countryName when unset", () => {
    const user = User.fromPersistence(baseProps());
    const contract = user.toContract();
    expect(contract.age).toBeNull();
    expect(contract.countryName).toBeNull();
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
      extraCurrencies: ["USD", "EUR"],
      budgetAlertThreshold: 90,
    });
    const contract = user.toContract();
    expect(contract.hideBalances).toBe(true);
    expect(contract.extraCurrencies).toEqual(["USD", "EUR"]);
    expect(contract.budgetAlertThreshold).toBe(90);
  });

  it("changePasswordHash() replaces the stored hash", () => {
    const user = User.fromPersistence(baseProps({ passwordHash: "old" }));
    user.changePasswordHash("new-hash");
    expect(user.passwordHash).toBe("new-hash");
  });

  describe("delete()", () => {
    it("flips ACTIVE -> DISABLED, stamps deletedAt and emits UserAccountDeletedEvent", () => {
      const user = User.fromPersistence(baseProps({ status: "ACTIVE" }));
      const event = user.delete();
      expect(user.status).toBe("DISABLED");
      expect(event).not.toBeNull();
      expect(event?.userId).toBe("u1");
    });

    it("is idempotent: deleting an already-deleted account emits no event", () => {
      const user = User.fromPersistence(baseProps({ status: "DISABLED", deletedAt: new Date() }));
      const event = user.delete();
      expect(event).toBeNull();
    });

    it("scrubs every PII field (Ley 21.719 Art. 11 supresión)", () => {
      const user = User.fromPersistence(
        baseProps({
          name: "Ana Bravo",
          email: "a@b.com",
          phone: "+56911111111",
          addressStreet: "Av. Siempre Viva 123",
          birthDate: new Date("1990-01-01"),
          identifierType: "RUT",
          identifierValue: "11.111.111-1",
        }),
      );
      user.delete();
      const contract = user.toContract();
      expect(contract.name).toBeNull();
      expect(contract.email).toBeNull();
      expect(contract.phone).toBeNull();
      expect(contract.addressStreet).toBeNull();
      expect(contract.birthDate).toBeNull();
      expect(contract.identifierValue).toBeNull();
      expect(user.passwordHash).toBeNull();
    });
  });
});

describe("User.closeOnboarding (2026-10-11)", () => {
  it("closes the first-steps guide once and keeps the first date", () => {
    const user = User.fromPersistence(baseProps());
    expect(user.onboardingClosed).toBe(false);
    expect(user.toContract().onboardingClosed).toBe(false);

    const first = new Date("2026-10-11T10:00:00Z");
    expect(user.closeOnboarding(first)).toBe(true);
    expect(user.closeOnboarding(new Date("2026-10-12T10:00:00Z"))).toBe(false);
    expect(user.onboardingClosedAt).toEqual(first);
    expect(user.toContract().onboardingClosed).toBe(true);
  });
});

describe("User.markReleaseNotesSeen (spec 038)", () => {
  it("starts with nothing seen and only moves forward, comparing numbers", () => {
    const user = User.fromPersistence(baseProps());
    expect(user.toContract().releaseNotesSeenVersion).toBeNull();

    expect(user.markReleaseNotesSeen("1.9")).toBe(true);
    expect(user.markReleaseNotesSeen("1.9")).toBe(false);
    expect(user.markReleaseNotesSeen("1.2")).toBe(false);
    expect(user.releaseNotesSeenVersion).toBe("1.9");

    expect(user.markReleaseNotesSeen("1.10")).toBe(true);
    expect(user.toContract().releaseNotesSeenVersion).toBe("1.10");
  });

  it("replaces a stored value that isn't a version (a record id from before versions)", () => {
    const user = User.fromPersistence({ ...baseProps(), releaseNotesSeenVersion: "2026-11-01-x" });
    expect(user.markReleaseNotesSeen("1.1")).toBe(true);
    expect(user.releaseNotesSeenVersion).toBe("1.1");
  });
});

describe("User — second-factor method (specs/040)", () => {
  it("reads a pre-040 row with MFA on and no method as TOTP, and null without MFA", () => {
    expect(User.fromPersistence(baseProps({ mfaEnabled: true })).mfaMethodOrDefault()).toBe("TOTP");
    expect(User.fromPersistence(baseProps({ mfaEnabled: false })).mfaMethodOrDefault()).toBeNull();
    expect(User.fromPersistence(baseProps({ mfaEnabled: true })).toContract().mfaMethod).toBe(
      "totp",
    );
  });

  it("activates email codes without keeping a TOTP secret", () => {
    const user = User.fromPersistence(baseProps());
    user.startMfaEnrollment("EMAIL");
    expect(user.confirmMfaEnrollment()).toBe("ACTIVATED");
    expect(user.mfaMethodOrDefault()).toBe("EMAIL");
    expect(user.mfaSecret).toBeNull();
  });

  it("changes TOTP → EMAIL, dropping the secret, and EMAIL → TOTP with a new one", () => {
    const user = User.fromPersistence(
      baseProps({ mfaEnabled: true, mfaMethod: "TOTP", mfaSecret: "OLDSECRET" }),
    );
    user.startMfaEnrollment("EMAIL");
    // Until confirmed, the authenticator app keeps working.
    expect(user.mfaMethodOrDefault()).toBe("TOTP");
    expect(user.mfaSecret).toBe("OLDSECRET");
    expect(user.confirmMfaEnrollment()).toBe("CHANGED");
    expect(user.mfaSecret).toBeNull();

    user.startMfaEnrollment("TOTP", "NEWSECRET");
    expect(user.mfaMethodOrDefault()).toBe("EMAIL");
    expect(user.confirmMfaEnrollment()).toBe("CHANGED");
    expect(user.mfaMethodOrDefault()).toBe("TOTP");
    expect(user.mfaSecret).toBe("NEWSECRET");
  });

  it("refuses changing to the method already in use", () => {
    const user = User.fromPersistence(baseProps({ mfaEnabled: true, mfaMethod: "EMAIL" }));
    expect(() => user.startMfaEnrollment("EMAIL")).toThrow(MfaSameMethodError);
  });

  it("refuses to confirm with nothing pending", () => {
    expect(() => User.fromPersistence(baseProps()).confirmMfaEnrollment()).toThrow(
      MfaNotPendingError,
    );
    expect(() =>
      User.fromPersistence(
        baseProps({ mfaEnabled: true, mfaMethod: "TOTP" }),
      ).confirmMfaEnrollment(),
    ).toThrow(MfaAlreadyEnabledError);
  });

  it("still confirms a pending TOTP secret started before the method column existed", () => {
    const user = User.fromPersistence(baseProps({ mfaSecret: "LEGACY" }));
    expect(user.confirmMfaEnrollment()).toBe("ACTIVATED");
    expect(user.mfaMethodOrDefault()).toBe("TOTP");
  });

  it("forgets the method when MFA is disabled", () => {
    const user = User.fromPersistence(baseProps({ mfaEnabled: true, mfaMethod: "EMAIL" }));
    user.disableMfa();
    expect(user.mfaMethodOrDefault()).toBeNull();
    expect(user.toContract().mfaMethod).toBeNull();
  });
});
