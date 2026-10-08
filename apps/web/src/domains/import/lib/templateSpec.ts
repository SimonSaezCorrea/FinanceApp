import { accounts, imports } from "@finance/contracts";

/**
 * The Cuadra template (specs/027), described ONCE: `buildTemplate` writes a
 * workbook from it and `readTemplate` reads one back with it, so the two can't
 * drift. Sheets and columns are identified by stable keys; what the user sees
 * (sheet names, headers, list values) is i18n under `import.template.*`, and a
 * file is recognised in either language whatever the app's own language is.
 */

export type ColumnKind = "date" | "money" | "int" | "text" | "list";

/** Closed value lists. Reference lists (`account`, `card`, `category`,
 * `currency`) come from the user's own data; the rest are fixed. */
export type ListKey =
  | "account"
  | "card"
  | "category"
  | "currency"
  | "movementType"
  | "direction"
  | "planFrequency"
  | "recurrenceFrequency"
  | "yesNo"
  | "accountType"
  | "cardKind"
  | "cardNetwork"
  | "accountStatus";

export interface TemplateColumn {
  key: string;
  kind: ColumnKind;
  required?: boolean;
  list?: ListKey;
  /** Column width in the generated sheet, in Excel characters. */
  width?: number;
}

export interface TemplateSheetSpec {
  key: imports.TemplateSheetKey;
  columns: TemplateColumn[];
}

const date = (key: string, required = true): TemplateColumn => ({
  key,
  kind: "date",
  required,
  width: 13,
});
const money = (key: string, required = true): TemplateColumn => ({
  key,
  kind: "money",
  required,
  width: 14,
});
const int = (key: string, required = false): TemplateColumn => ({
  key,
  kind: "int",
  required,
  width: 10,
});
const txt = (key: string, required = false, width = 24): TemplateColumn => ({
  key,
  kind: "text",
  required,
  width,
});
const list = (key: string, of: ListKey, required = false, width = 22): TemplateColumn => ({
  key,
  kind: "list",
  list: of,
  required,
  width,
});

export const TEMPLATE_SHEETS: TemplateSheetSpec[] = [
  {
    key: "accounts",
    columns: [
      txt("name", true, 26),
      list("type", "accountType", true, 18),
      list("currency", "currency", true, 10),
      txt("institution", false, 20),
      txt("accountNumber", false, 18),
      money("openingBalance", false),
      money("creditLimit", false),
      money("creditUsedInitial", false),
      money("overdraftLimit", false),
      money("balanceCeiling", false),
      txt("minimumPaymentPercent", false, 12),
      list("status", "accountStatus", false, 12),
    ],
  },
  {
    key: "cards",
    columns: [
      list("account", "account", true),
      list("kind", "cardKind", true, 12),
      txt("last4", true, 10),
      txt("expiry", true, 12),
      txt("name", false, 16),
      list("network", "cardNetwork", false, 14),
      list("isVirtual", "yesNo", false, 10),
      list("isAdditional", "yesNo", false, 10),
      txt("cardholderName", false, 20),
      money("ownLimit", false),
      list("extraLimitCurrency", "currency", false, 12),
      money("extraLimit", false),
      list("isActive", "yesNo", false, 10),
    ],
  },
  {
    key: "movements",
    columns: [
      date("date"),
      list("type", "movementType", true, 12),
      money("amount"),
      list("currency", "currency", false, 10),
      list("account", "account", true),
      list("card", "card"),
      list("category", "category"),
      txt("description", false, 30),
      txt("observation", false, 30),
      txt("emisor"),
      txt("receptor"),
      txt("lugar"),
      list("financeCharge", "yesNo", false, 12),
      txt("recurring", false, 14),
    ],
  },
  {
    key: "transfers",
    columns: [
      date("date"),
      list("fromAccount", "account", true),
      list("toAccount", "account", true),
      money("amount"),
      money("incomingAmount", false),
      txt("description", false, 30),
    ],
  },
  {
    key: "debts",
    columns: [
      txt("ref", true, 14),
      list("direction", "direction", true, 14),
      txt("counterparty", true),
      txt("title"),
      money("principal"),
      list("currency", "currency", true, 10),
      date("openedAt"),
      date("dueAt", false),
      int("installments"),
      list("frequency", "planFrequency", false, 14),
      int("every"),
      list("account", "account"),
      txt("notes", false, 30),
    ],
  },
  {
    key: "debtPayments",
    columns: [
      txt("ref", true, 14),
      date("date"),
      list("account", "account", true),
      money("amount", false),
    ],
  },
  {
    key: "plans",
    columns: [
      txt("ref", true, 14),
      txt("title", true, 28),
      date("startDate"),
      money("totalPrincipal"),
      int("installments", true),
      list("currency", "currency", true, 10),
      list("frequency", "planFrequency", false, 14),
      int("every"),
      money("interest", false),
      list("card", "card"),
      list("category", "category"),
      list("account", "account"),
    ],
  },
  {
    key: "planPayments",
    columns: [
      txt("ref", true, 14),
      int("sequence", true),
      date("date"),
      list("account", "account"),
      money("amount", false),
      list("freesCredit", "yesNo", false, 12),
    ],
  },
  {
    key: "recurring",
    columns: [
      txt("ref", false, 14),
      txt("label", true, 26),
      money("amount"),
      list("currency", "currency", true, 10),
      list("frequency", "recurrenceFrequency", true, 14),
      int("every"),
      date("anchorDate"),
      date("endDate", false),
      list("account", "account"),
      list("card", "card"),
      list("category", "category"),
      txt("notes", false, 30),
    ],
  },
  {
    key: "goals",
    columns: [
      txt("ref", true, 14),
      txt("title", true, 26),
      money("targetAmount"),
      list("currency", "currency", true, 10),
      date("deadline", false),
      txt("notes", false, 30),
    ],
  },
  {
    key: "contributions",
    columns: [
      txt("ref", true, 14),
      date("date"),
      money("amount"),
      list("account", "account", true),
    ],
  },
  {
    key: "statements",
    columns: [
      list("account", "account", true),
      list("currency", "currency", false, 10),
      date("periodStart"),
      date("closedAt"),
      date("dueDate"),
      date("paidAt", false),
      money("paidAmount", false),
      list("paidFrom", "account"),
    ],
  },
];

/** Fixed lists: their stored values, each shown as `import.template.values.<list>.<value>`. */
export const FIXED_LISTS: Partial<Record<ListKey, readonly string[]>> = {
  movementType: ["EXPENSE", "INCOME"],
  direction: ["OWED_TO_YOU", "YOU_OWE"],
  planFrequency: ["MONTHLY", "WEEKLY", "YEARLY", "DAILY"],
  recurrenceFrequency: ["MONTHLY", "WEEKLY", "YEARLY"],
  yesNo: ["YES", "NO"],
  accountType: accounts.accountType.options,
  cardKind: accounts.cardKind.options,
  cardNetwork: accounts.cardNetwork.options,
  accountStatus: accounts.accountStatus.options,
};

/** Hidden sheet that marks a file as a Cuadra template. */
export const MARKER_SHEET = "_cuadra";
/** Visible sheets that carry no rows. */
export const INSTRUCTIONS_KEY = "instructions";
export const REFERENCE_KEY = "reference";

export const TEMPLATE_VERSION = imports.TEMPLATE_VERSION;

/** Last column of a pre-filled template: the id of the record a row came from.
 * A row that carries one is already in the app, so the reader skips it. */
export const EXISTING_ID_HEADER_KEY = "import.template.existingId.header";
export const EXISTING_ID_HELP_KEY = "import.template.existingId.help";

/** i18n key of a sheet's visible name. */
export const sheetNameKey = (sheet: string) => `import.template.sheets.${sheet}`;
/** i18n key of a column's header. */
export const columnKey = (sheet: string, column: string) =>
  `import.template.columns.${sheet}.${column}`;
/** i18n key of a column's description (Instructions sheet + header note). */
export const columnHelpKey = (sheet: string, column: string) =>
  `import.template.columnHelp.${sheet}.${column}`;
/** i18n key of a fixed list value's label. */
export const valueKey = (list: ListKey, value: string) => `import.template.values.${list}.${value}`;

/** How a card is written in the template: which account it belongs to and its
 * last four digits — unique per user, and still readable. */
export const cardLabel = (accountName: string, last4: string) => `${accountName} · ····${last4}`;
