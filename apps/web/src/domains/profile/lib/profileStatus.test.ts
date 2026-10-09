import { describe, expect, it } from "vitest";

import type { auth } from "@finance/contracts";

import i18n from "../../../i18n";
import {
  contactCompleteness,
  nextProtectionStep,
  protectionStages,
  sectionStatuses,
  sessionsPreview,
} from "./profileStatus";

describe("sectionStatuses", () => {
  const t = i18n.t.bind(i18n);
  const base = {
    user: {
      mfaEnabled: false,
      email: "ana@correo.cl",
      identifierValue: "12.345.678-5",
      phone: null as string | null,
      preferredCurrency: "CLP",
      locale: "es",
    },
    passkeyCount: 1 as number | null,
    passkeysSupported: true,
    openSessions: 2 as number | null,
    activeConsents: 1 as number | null,
    themeMode: "dark" as const,
  };

  it("summary counts actionable protection stages plus missing details", () => {
    const s = sectionStatuses(base, t);
    expect(s.summary.pending).toBe(2);
    expect(s.summary.line).toBe(t("profile.status.summary.pending", { count: 2 }));
  });

  it("summary is in order when nothing is pending", () => {
    const s = sectionStatuses(
      { ...base, user: { ...base.user, mfaEnabled: true, phone: "+56 9 1234 5678" } },
      t,
    );
    expect(s.summary).toEqual({ line: t("profile.status.summary.ok"), pending: 0 });
  });

  it("a passkey this device can't add doesn't count as pending", () => {
    const s = sectionStatuses(
      {
        ...base,
        passkeyCount: 0,
        passkeysSupported: false,
        user: { ...base.user, mfaEnabled: true, phone: "x" },
      },
      t,
    );
    expect(s.summary.pending).toBe(0);
    expect(s.security.pending).toBe(0);
  });

  it("personal names the one missing detail, or counts several", () => {
    expect(sectionStatuses(base, t).personal).toEqual({
      line: t("profile.status.personal.missing.phone"),
      pending: 1,
    });
    const many = sectionStatuses({ ...base, user: { ...base.user, identifierValue: null } }, t);
    expect(many.personal).toEqual({
      line: t("profile.status.personal.missingMany", { count: 2 }),
      pending: 2,
    });
    const none = sectionStatuses({ ...base, user: { ...base.user, phone: "x" } }, t);
    expect(none.personal).toEqual({ line: t("profile.status.personal.complete"), pending: 0 });
  });

  it("security says two-step is off, else how many sessions are open", () => {
    expect(sectionStatuses(base, t).security).toEqual({
      line: t("profile.status.security.twoFactorOff"),
      pending: 1,
    });
    const on = sectionStatuses({ ...base, user: { ...base.user, mfaEnabled: true } }, t);
    expect(on.security).toEqual({
      line: t("profile.status.security.sessions", { count: 2 }),
      pending: 0,
    });
  });

  it("preferences reads currency · language · theme and never asks for action", () => {
    expect(sectionStatuses(base, t).preferences).toEqual({
      line: `CLP · ${t("profile.status.preferences.language.es")} · ${t("theme.dark")}`,
      pending: 0,
    });
  });

  it("privacy counts active consents and never asks for action", () => {
    expect(sectionStatuses(base, t).privacy).toEqual({
      line: t("profile.status.privacy.consents", { count: 1 }),
      pending: 0,
    });
  });
});

describe("protectionStages", () => {
  it("lists the three stages in fixed order, with password always done", () => {
    const stages = protectionStages({
      mfaEnabled: false,
      passkeyCount: 0,
      passkeysSupported: true,
    });
    expect(stages.map((s) => s.key)).toEqual(["password", "passkey", "twoFactor"]);
    expect(stages[0]!.done).toBe(true);
  });

  it("marks the passkey stage done with at least one passkey, and two-step by mfaEnabled", () => {
    const stages = protectionStages({ mfaEnabled: true, passkeyCount: 2, passkeysSupported: true });
    expect(stages.map((s) => s.done)).toEqual([true, true, true]);
  });

  it("leaves the passkey stage undecided while the passkey list is still loading", () => {
    const stages = protectionStages({
      mfaEnabled: false,
      passkeyCount: null,
      passkeysSupported: true,
    });
    expect(stages[1]!.done).toBeNull();
  });

  it("marks the passkey stage unavailable on a browser without WebAuthn", () => {
    const stages = protectionStages({
      mfaEnabled: false,
      passkeyCount: 0,
      passkeysSupported: false,
    });
    expect(stages[1]).toMatchObject({ done: false, available: false });
  });

  it("points each stage at the block of Security that resolves it", () => {
    const stages = protectionStages({
      mfaEnabled: false,
      passkeyCount: 0,
      passkeysSupported: true,
    });
    expect(stages.map((s) => s.target)).toEqual([
      "/profile/security#password",
      "/profile/security#passkeys",
      "/profile/security#two-factor",
    ]);
  });
});

describe("nextProtectionStep", () => {
  const stages = (mfaEnabled: boolean, passkeyCount: number | null, passkeysSupported = true) =>
    protectionStages({ mfaEnabled, passkeyCount, passkeysSupported });

  it("1 of 3: the next step is adding a passkey", () => {
    expect(nextProtectionStep(stages(false, 0))?.key).toBe("passkey");
  });

  it("2 of 3: the next step is two-step verification", () => {
    expect(nextProtectionStep(stages(false, 1))?.key).toBe("twoFactor");
  });

  it("3 of 3: there is no next step", () => {
    expect(nextProtectionStep(stages(true, 1))).toBeNull();
  });

  it("follows the fixed order even when two-step was done before the passkey", () => {
    expect(nextProtectionStep(stages(true, 0))?.key).toBe("passkey");
  });

  it("skips the passkey when this device can't register one", () => {
    expect(nextProtectionStep(stages(false, 0, false))?.key).toBe("twoFactor");
  });

  it("has no next step when only the passkey is missing and this device can't add it", () => {
    expect(nextProtectionStep(stages(true, 0, false))).toBeNull();
  });

  it("is undecided (undefined) while an earlier stage is still loading", () => {
    expect(nextProtectionStep(stages(false, null))).toBeUndefined();
  });
});

describe("contactCompleteness", () => {
  it("counts email, identity and phone out of three — never the photo", () => {
    const result = contactCompleteness({
      email: "ana@correo.cl",
      identifierValue: "12.345.678-5",
      phone: null,
    });
    expect(result.total).toBe(3);
    expect(result.done).toBe(2);
    expect(result.items.map((i) => [i.key, i.done])).toEqual([
      ["email", true],
      ["identity", true],
      ["phone", false],
    ]);
  });

  it("reaches 3 of 3 with all three filled in", () => {
    expect(
      contactCompleteness({ email: "a@b.cl", identifierValue: "1-9", phone: "+56 9 1234 5678" })
        .done,
    ).toBe(3);
  });

  it("treats empty or missing values as not done", () => {
    expect(contactCompleteness({ email: "", identifierValue: null, phone: undefined }).done).toBe(
      0,
    );
  });

  it("names the personal-info row each missing item opens", () => {
    const result = contactCompleteness({ email: "a@b.cl", identifierValue: null, phone: null });
    expect(result.items.map((i) => i.editField)).toEqual(["email", "identifier", "phone"]);
  });
});

function session(overrides: Partial<auth.Session>): auth.Session {
  return {
    id: overrides.id ?? "s",
    deviceLabel: "Chrome · Windows",
    country: "CL",
    city: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    lastUsedAt: "2026-10-01T10:00:00.000Z",
    closedAt: null,
    isCurrent: false,
    ...overrides,
  } as auth.Session;
}

describe("sessionsPreview", () => {
  it("shows the only open session, the current one", () => {
    const result = sessionsPreview([session({ id: "a", isCurrent: true })]);
    expect(result.shown.map((s) => s.id)).toEqual(["a"]);
    expect(result).toMatchObject({ hiddenCount: 0, openCount: 1 });
  });

  it("puts the current session first, then by most recent activity, ignoring closed ones", () => {
    const result = sessionsPreview([
      session({ id: "old", lastUsedAt: "2026-10-01T08:00:00.000Z" }),
      session({ id: "closed", closedAt: "2026-10-02T08:00:00.000Z" }),
      session({ id: "new", lastUsedAt: "2026-10-03T08:00:00.000Z" }),
      session({ id: "me", isCurrent: true, lastUsedAt: "2026-09-30T08:00:00.000Z" }),
    ]);
    expect(result.shown.map((s) => s.id)).toEqual(["me", "new", "old"]);
    expect(result.openCount).toBe(3);
  });

  it("shows at most three and counts the rest", () => {
    const result = sessionsPreview(
      ["a", "b", "c", "d", "e"].map((id, i) =>
        session({ id, isCurrent: i === 4, lastUsedAt: `2026-10-0${i + 1}T08:00:00.000Z` }),
      ),
    );
    expect(result.shown.map((s) => s.id)).toEqual(["e", "d", "c"]);
    expect(result).toMatchObject({ hiddenCount: 2, openCount: 5 });
  });
});
