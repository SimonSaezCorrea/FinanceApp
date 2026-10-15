import type { Workbook, Worksheet } from "exceljs";
import type { TFunction } from "i18next";

import type { auth, reference, wallet } from "@finance/contracts";

import { authApi, passkeyApi } from "@finance/client";

import { walletApi } from "../../dashboard/api/walletApi";
import { loadExistingData } from "../../import/lib/loadExistingData";
import type { ExistingData } from "../../import/lib/templateData";
import { consentsApi } from "../api/consentsApi";
import { sessionsApi } from "../api/sessionsApi";

/**
 * "Descargar mis datos" (Ley 21.719, portability): everything the app keeps about the person,
 * read through the same endpoints the app itself uses — so the file can't promise more or less
 * than what is really stored. Never in it, because the API never sends them: the password,
 * the second-factor secret and recovery codes, a passkey's public key, the guardian's identifier
 * (only its hash exists) and receipt files (only their names).
 */
export interface PersonalData {
  user: auth.CurrentUser;
  emails: auth.UserEmail[];
  consents: auth.ConsentRecord[];
  sessions: auth.Session[];
  passkeys: auth.Passkey[];
  wallet: wallet.WalletItem[];
  financial: ExistingData;
}

export type PersonalDataFormat = "xlsx" | "json";

/** Bumped when the JSON's shape changes, so whoever reads an old file knows which one it is. */
export const PERSONAL_DATA_JSON_VERSION = 1;

export async function loadPersonalData(categories: reference.Category[]): Promise<PersonalData> {
  const [user, emails, consents, sessions, passkeys, walletItems, financial] = await Promise.all([
    authApi.me(),
    authApi.listEmails(),
    consentsApi.list(),
    sessionsApi.list(),
    passkeyApi.list(),
    walletApi.list(),
    loadExistingData(categories),
  ]);
  return {
    user,
    emails: emails.items,
    consents,
    sessions,
    passkeys,
    wallet: walletItems,
    financial,
  };
}

/** The whole export as one JSON document: every record exactly as the API returns it, grouped
 * by what it is, plus the catalogue its `categoryId`s point at. */
export function personalDataJson(data: PersonalData, exportedAt: Date): string {
  const f = data.financial;
  const usedCategoryIds = new Set(
    [...f.transactions, ...f.plans, ...f.recurring].map((r) => r.categoryId).filter(Boolean),
  );
  return JSON.stringify(
    {
      format: "fik-personal-data",
      version: PERSONAL_DATA_JSON_VERSION,
      exportedAt: exportedAt.toISOString(),
      profile: data.user,
      emails: data.emails,
      consents: data.consents,
      sessions: data.sessions,
      passkeys: data.passkeys,
      accounts: f.accounts,
      creditStatements: f.statements,
      transactions: f.transactions,
      debts: f.debts,
      installmentPlans: f.plans,
      recurringExpenses: f.recurring,
      savingsGoals: f.goals,
      savingsEntries: f.entries,
      wallet: data.wallet,
      categories: f.categories
        .filter((c) => usedCategoryIds.has(c.id))
        .map((c) => ({ id: c.id, code: c.code, kind: c.kind })),
    },
    null,
    2,
  );
}

/** "2026-10-15" for a file name, in the person's own day. */
export function exportFileDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type CellValue = string | number | boolean | Date | null;

/** A sheet of rows under a bold header row, columns sized to their content. */
function addTable(workbook: Workbook, name: string, headers: string[], rows: CellValue[][]) {
  const sheet: Worksheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(headers).font = { bold: true };
  for (const row of rows) sheet.addRow(row.map((v) => v ?? ""));
  headers.forEach((header, i) => {
    const longest = Math.max(
      header.length,
      ...rows.map((r) => {
        const v = r[i];
        return v instanceof Date ? 16 : String(v ?? "").length;
      }),
    );
    const column = sheet.getColumn(i + 1);
    column.width = Math.min(Math.max(longest + 2, 10), 60);
    if (rows.some((r) => r[i] instanceof Date)) column.numFmt = "dd/mm/yyyy hh:mm";
  });
}

const date = (iso: string | null) => (iso ? new Date(iso) : null);

/**
 * The sheets "Descargar mis datos" adds after the pre-filled template's own: the profile (one
 * field per row), and one table each for emails, consents, sessions and passkeys. Labels in the
 * person's language; values as stored.
 */
export function personalSheets(data: PersonalData, t: TFunction) {
  const yesNo = (v: boolean) => t(v ? "profile.export.yes" : "profile.export.no");
  const u = data.user;
  return (workbook: Workbook) => {
    const field = (key: string) => t(`profile.export.fields.${key}`);
    const profileRows: [string, CellValue][] = [
      [field("name"), u.name],
      [field("email"), u.email],
      [field("emailVerified"), yesNo(u.emailVerified)],
      [
        field("identifierType"),
        u.identifierType ? t(`profile.edit.identifierTypes.${u.identifierType}`) : null,
      ],
      [field("identifierValue"), u.identifierValue],
      [field("birthDate"), u.birthDate],
      [field("phone"), u.phone],
      [field("country"), u.countryName],
      [field("addressStreet"), u.addressStreet],
      [field("addressCity"), u.addressCity],
      [field("addressRegion"), u.addressRegion],
      [field("addressPostalCode"), u.addressPostalCode],
      [field("preferredCurrency"), u.preferredCurrency],
      [field("extraCurrencies"), u.extraCurrencies.join(", ")],
      [field("locale"), u.locale],
      [field("theme"), u.theme],
      [field("hideBalances"), yesNo(u.hideBalances)],
      [field("mfaEnabled"), yesNo(u.mfaEnabled)],
      [field("memberSinceYear"), u.memberSinceYear],
    ];
    addTable(
      workbook,
      t("profile.export.sheets.profile"),
      [t("profile.export.columns.field"), t("profile.export.columns.value")],
      profileRows,
    );

    addTable(
      workbook,
      t("profile.export.sheets.emails"),
      [
        t("profile.export.columns.address"),
        t("profile.export.columns.status"),
        t("profile.export.columns.verifiedAt"),
        t("profile.export.columns.createdAt"),
        t("profile.export.columns.replacedAt"),
      ],
      data.emails.map((e) => [
        e.address,
        t(`profile.emails.status.${e.status}`),
        date(e.verifiedAt),
        date(e.createdAt),
        date(e.replacedAt),
      ]),
    );

    addTable(
      workbook,
      t("profile.export.sheets.consents"),
      [
        t("profile.export.columns.consent"),
        t("profile.export.columns.policyVersion"),
        t("profile.export.columns.grantedAt"),
        t("profile.export.columns.revokedAt"),
        t("profile.export.columns.guardianName"),
        t("profile.export.columns.guardianRelationship"),
      ],
      data.consents.map((c) => [
        t(
          c.type === "SENSITIVE_DATA_PROCESSING"
            ? "profile.consents.type.sensitiveDataProcessing"
            : "profile.consents.type.minorGuardianAuthorization",
        ),
        c.policyVersion,
        date(c.grantedAt),
        date(c.revokedAt),
        c.guardianName,
        c.guardianRelationship ? t(`auth.guardian.relationship.${c.guardianRelationship}`) : null,
      ]),
    );

    addTable(
      workbook,
      t("profile.export.sheets.sessions"),
      [
        t("profile.export.columns.device"),
        t("profile.export.columns.country"),
        t("profile.export.columns.city"),
        t("profile.export.columns.createdAt"),
        t("profile.export.columns.lastUsedAt"),
        t("profile.export.columns.closedAt"),
      ],
      data.sessions.map((s) => [
        s.deviceLabel,
        s.country,
        s.city,
        date(s.createdAt),
        date(s.lastUsedAt),
        date(s.closedAt),
      ]),
    );

    addTable(
      workbook,
      t("profile.export.sheets.passkeys"),
      [
        t("profile.export.columns.name"),
        t("profile.export.columns.createdAt"),
        t("profile.export.columns.lastUsedAt"),
      ],
      data.passkeys.map((p) => [p.name, date(p.createdAt), date(p.lastUsedAt)]),
    );
  };
}
