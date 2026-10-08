import type { TFunction } from "i18next";

import type { auth } from "@finance/contracts";

import type { ThemeMode } from "../../../theme/useTheme";
import type { ProfileSectionKey } from "./profileSections";

/*
 * Everything the profile summary and the section list say about the account's state (specs/029,
 * data-model.md). Pure functions over data the app already has — the summary, the section list and
 * the phone's start view all read from here, so they can't disagree.
 */

export type ProtectionStageKey = "password" | "passkey" | "twoFactor";

export interface ProtectionStage {
  key: ProtectionStageKey;
  /** `null` while the data that decides it is still loading (FR-014). */
  done: boolean | null;
  /** Whether it can be completed on THIS device (a passkey needs WebAuthn). */
  available: boolean;
  /** Where in Security this stage is resolved. */
  target: string;
}

export function protectionStages(input: {
  mfaEnabled: boolean;
  /** `null` while the passkey list is loading. */
  passkeyCount: number | null;
  passkeysSupported: boolean;
}): ProtectionStage[] {
  return [
    // Registration requires a password, so every account has one (spec, Assumptions).
    { key: "password", done: true, available: true, target: "/profile/security#password" },
    {
      key: "passkey",
      done: input.passkeyCount === null ? null : input.passkeyCount > 0,
      available: input.passkeysSupported,
      target: "/profile/security#passkeys",
    },
    {
      key: "twoFactor",
      done: input.mfaEnabled,
      available: true,
      target: "/profile/security#two-factor",
    },
  ];
}

/**
 * The first stage, in the fixed order, that is pending AND can be done on this device (FR-010,
 * FR-010a). `null` when there is none; `undefined` while a stage before it is still loading, so the
 * summary shows a loading state instead of guessing.
 */
export function nextProtectionStep(stages: ProtectionStage[]): ProtectionStage | null | undefined {
  for (const stage of stages) {
    if (stage.done === null) return undefined;
    if (!stage.done && stage.available) return stage;
  }
  return null;
}

export function doneStageCount(stages: ProtectionStage[]): number {
  return stages.filter((s) => s.done === true).length;
}

/** Pending stages the user can act on here — what the summary's "pending" count includes. */
export function actionableStageCount(stages: ProtectionStage[]): number {
  return stages.filter((s) => s.done === false && s.available).length;
}

export type ContactItemKey = "email" | "identity" | "phone";
export type PersonalEditField = "email" | "identifier" | "phone";

export interface ContactCompleteness {
  items: { key: ContactItemKey; done: boolean; editField: PersonalEditField }[];
  done: number;
  total: 3;
}

const filled = (value: string | null | undefined) => Boolean(value && value.trim());

/** Contact and identity details on file, out of three. The profile photo never counts: there is no
 * way to upload one (FR-011). */
export function contactCompleteness(user: {
  email?: string | null;
  identifierValue?: string | null;
  phone?: string | null;
}): ContactCompleteness {
  const items: ContactCompleteness["items"] = [
    { key: "email", done: filled(user.email), editField: "email" },
    { key: "identity", done: filled(user.identifierValue), editField: "identifier" },
    { key: "phone", done: filled(user.phone), editField: "phone" },
  ];
  return { items, done: items.filter((i) => i.done).length, total: 3 };
}

export interface SessionsPreview {
  shown: auth.Session[];
  hiddenCount: number;
  openCount: number;
}

/** Up to `max` open sessions: this device first, then the most recently active (FR-012). */
export function sessionsPreview(sessions: auth.Session[], max = 3): SessionsPreview {
  const open = sessions
    .filter((s) => s.closedAt === null)
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    });
  return {
    shown: open.slice(0, max),
    hiddenCount: Math.max(0, open.length - max),
    openCount: open.length,
  };
}

export interface SectionStatus {
  /** The one-line state shown under the section's name. */
  line: string;
  /** How many things need the user here; 0 = no indicator (FR-002). */
  pending: number;
}

export type SectionStatuses = Record<ProfileSectionKey, SectionStatus>;

/**
 * Each section's status line and pending count (FR-002, data-model.md). Takes `t` so the wording
 * stays in the catalogs while the rules stay testable here: what counts as pending is decided once.
 */
export function sectionStatuses(
  input: {
    user: {
      mfaEnabled: boolean;
      email?: string | null;
      identifierValue?: string | null;
      phone?: string | null;
      preferredCurrency: string;
      locale: string;
    };
    passkeyCount: number | null;
    passkeysSupported: boolean;
    openSessions: number | null;
    activeConsents: number | null;
    themeMode: ThemeMode;
  },
  t: TFunction,
): SectionStatuses {
  const stages = protectionStages({
    mfaEnabled: input.user.mfaEnabled,
    passkeyCount: input.passkeyCount,
    passkeysSupported: input.passkeysSupported,
  });
  const actionable = actionableStageCount(stages);
  const completeness = contactCompleteness(input.user);
  const missing = completeness.items.filter((i) => !i.done);
  const summaryPending = actionable + missing.length;

  const personalLine =
    missing.length === 0
      ? t("profile.status.personal.complete")
      : missing.length === 1
        ? t(`profile.status.personal.missing.${missing[0]!.key}`)
        : t("profile.status.personal.missingMany", { count: missing.length });

  const securityLine = !input.user.mfaEnabled
    ? t("profile.status.security.twoFactorOff")
    : input.openSessions === null
      ? t("profile.status.security.twoFactorOn")
      : t("profile.status.security.sessions", { count: input.openSessions });

  return {
    summary: {
      line:
        summaryPending > 0
          ? t("profile.status.summary.pending", { count: summaryPending })
          : t("profile.status.summary.ok"),
      pending: summaryPending,
    },
    personal: { line: personalLine, pending: missing.length },
    security: { line: securityLine, pending: actionable },
    preferences: {
      line: [
        input.user.preferredCurrency,
        t(`profile.status.preferences.language.${input.user.locale}`),
        t(`theme.${input.themeMode}`),
      ].join(" · "),
      pending: 0,
    },
    privacy: {
      line:
        input.activeConsents === null
          ? t("profile.status.privacy.fallback")
          : t("profile.status.privacy.consents", { count: input.activeConsents }),
      pending: 0,
    },
  };
}
