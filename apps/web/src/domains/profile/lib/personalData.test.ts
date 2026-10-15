import { describe, expect, it } from "vitest";

import i18n from "../../../i18n";
import {
  PERSONAL_DATA_JSON_VERSION,
  exportFileDate,
  personalDataJson,
  personalSheets,
  type PersonalData,
} from "./personalData";

const ID = (n: number) => `0190f3a2-7b1c-7000-8000-${String(n).padStart(12, "0")}`;

function sample(): PersonalData {
  return {
    user: {
      id: ID(1),
      email: "ana@example.com",
      name: "Ana Pérez",
      preferredCurrency: "CLP",
      locale: "es",
      theme: "dark",
      memberSinceYear: 2026,
      countryId: null,
      countryName: "Chile",
      addressStreet: null,
      addressCity: null,
      addressRegion: null,
      addressPostalCode: null,
      birthDate: "1990-05-04",
      age: 36,
      identifierType: "RUT",
      identifierValue: "123456785",
      phone: null,
      hideBalances: false,
      extraCurrencies: ["USD"],
      budgetAlertThreshold: null,
      mfaEnabled: true,
      mfaRecoveryCodesRemaining: 8,
      emailVerified: true,
      onboardingClosed: true,
    },
    emails: [
      {
        id: ID(2),
        address: "ana@example.com",
        status: "PRIMARY",
        verifiedAt: "2026-10-01T12:00:00.000Z",
        createdAt: "2026-10-01T11:00:00.000Z",
        replacedAt: null,
      },
    ],
    consents: [
      {
        id: ID(3),
        type: "SENSITIVE_DATA_PROCESSING",
        policyVersion: "2026-10-14",
        grantedAt: "2026-10-01T11:00:00.000Z",
        revokedAt: null,
        guardianName: null,
        guardianRelationship: null,
      },
    ],
    sessions: [
      {
        id: ID(4),
        deviceLabel: "Chrome · Windows",
        country: "CL",
        city: null,
        createdAt: "2026-10-01T11:00:00.000Z",
        lastUsedAt: "2026-10-15T11:00:00.000Z",
        closedAt: null,
        isCurrent: true,
      },
    ],
    passkeys: [
      { id: ID(5), name: "Mi notebook", createdAt: "2026-10-02T11:00:00.000Z", lastUsedAt: null },
    ],
    wallet: [],
    financial: {
      accounts: [],
      transactions: [
        { id: ID(6), categoryId: ID(9) } as PersonalData["financial"]["transactions"][number],
      ],
      debts: [],
      plans: [],
      recurring: [],
      goals: [],
      entries: [],
      statements: [],
      categories: [
        { id: ID(9), code: "FOOD", kind: "EXPENSE", isSystem: false, sortOrder: 1 },
        { id: ID(10), code: "SALARY", kind: "INCOME", isSystem: false, sortOrder: 2 },
      ] as PersonalData["financial"]["categories"],
    },
  };
}

describe("personalDataJson", () => {
  it("groups every record under its own key, versioned and dated", () => {
    const json = JSON.parse(personalDataJson(sample(), new Date("2026-10-15T15:00:00.000Z")));
    expect(json.format).toBe("fik-personal-data");
    expect(json.version).toBe(PERSONAL_DATA_JSON_VERSION);
    expect(json.exportedAt).toBe("2026-10-15T15:00:00.000Z");
    expect(json.profile.identifierValue).toBe("123456785");
    expect(json.emails).toHaveLength(1);
    expect(json.consents[0].policyVersion).toBe("2026-10-14");
    expect(json.sessions[0].deviceLabel).toBe("Chrome · Windows");
    expect(json.passkeys[0].name).toBe("Mi notebook");
    expect(json.transactions).toHaveLength(1);
    for (const key of [
      "accounts",
      "creditStatements",
      "debts",
      "installmentPlans",
      "recurringExpenses",
      "savingsGoals",
      "savingsEntries",
      "wallet",
    ]) {
      expect(json[key]).toEqual([]);
    }
  });

  it("lists only the categories the records point at, by code", () => {
    const json = JSON.parse(personalDataJson(sample(), new Date()));
    expect(json.categories).toEqual([{ id: ID(9), code: "FOOD", kind: "EXPENSE" }]);
  });
});

describe("exportFileDate", () => {
  it("is the local day, zero-padded", () => {
    expect(exportFileDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("personalSheets", () => {
  it("adds the profile, emails, consents, sessions and passkeys sheets, labelled", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    personalSheets(sample(), i18n.t)(workbook);

    const names = workbook.worksheets.map((s) => s.name);
    expect(names).toEqual(
      ["profile", "emails", "consents", "sessions", "passkeys"].map((k) =>
        i18n.t(`profile.export.sheets.${k}`),
      ),
    );

    const profile = workbook.getWorksheet(i18n.t("profile.export.sheets.profile"))!;
    const rows = new Map<string, unknown>();
    profile.eachRow((row, n) => {
      if (n > 1) rows.set(String(row.getCell(1).value), row.getCell(2).value);
    });
    expect(rows.get(i18n.t("profile.export.fields.name"))).toBe("Ana Pérez");
    expect(rows.get(i18n.t("profile.export.fields.identifierType"))).toBe("RUT");
    expect(rows.get(i18n.t("profile.export.fields.mfaEnabled"))).toBe(i18n.t("profile.export.yes"));
    expect(rows.get(i18n.t("profile.export.fields.extraCurrencies"))).toBe("USD");

    const emails = workbook.getWorksheet(i18n.t("profile.export.sheets.emails"))!;
    expect(emails.getRow(2).getCell(2).value).toBe(i18n.t("profile.emails.status.PRIMARY"));
    expect(emails.getRow(2).getCell(3).value).toBeInstanceOf(Date);

    const consents = workbook.getWorksheet(i18n.t("profile.export.sheets.consents"))!;
    expect(consents.getRow(2).getCell(1).value).toBe(
      i18n.t("profile.consents.type.sensitiveDataProcessing"),
    );
  });
});
