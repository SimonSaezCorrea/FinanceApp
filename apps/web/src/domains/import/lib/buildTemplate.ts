import type { TFunction } from "i18next";

import { reference, type accounts } from "@finance/contracts";

import {
  FIXED_LISTS,
  INSTRUCTIONS_KEY,
  MARKER_SHEET,
  REFERENCE_KEY,
  TEMPLATE_SHEETS,
  TEMPLATE_VERSION,
  cardLabel,
  columnHelpKey,
  columnKey,
  sheetNameKey,
  valueKey,
  type ListKey,
} from "./templateSpec";

/** The user's own data the template offers in its dropdowns. */
export interface TemplateRefs {
  /** Active accounts only — an inactive one takes no imported rows. */
  accounts: { id: string; name: string; type: accounts.AccountType; currency: string }[];
  cards: { id: string; accountId: string; accountName: string; last4: string }[];
  categories: reference.Category[];
  currencies: string[];
}

interface RangeValidations {
  dataValidations: {
    add(
      range: string,
      rule: { type: "list"; allowBlank: boolean; formulae: string[]; showErrorMessage: boolean },
    ): void;
  };
}

/** Rows a data sheet offers dropdowns for — well past anyone's history. */
const DATA_ROWS = 5000;

/** Where each list lives on the Reference sheet (a column per list). */
function referenceLists(refs: TemplateRefs, t: TFunction): Record<ListKey, string[]> {
  const fixed = (key: ListKey) => (FIXED_LISTS[key] ?? []).map((v) => t(valueKey(key, v)));
  return {
    account: refs.accounts.map((a) => a.name),
    card: refs.cards.map((c) => cardLabel(c.accountName, c.last4)),
    category: refs.categories
      .filter((c) => reference.isCategorySelectable(c))
      .map((c) => t(`categories.${c.code}`, { defaultValue: c.code })),
    currency: refs.currencies,
    movementType: fixed("movementType"),
    direction: fixed("direction"),
    planFrequency: fixed("planFrequency"),
    recurrenceFrequency: fixed("recurrenceFrequency"),
    yesNo: fixed("yesNo"),
  };
}

const LIST_ORDER: ListKey[] = [
  "account",
  "card",
  "category",
  "currency",
  "movementType",
  "direction",
  "planFrequency",
  "recurrenceFrequency",
  "yesNo",
];

const columnLetter = (index: number): string => {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

/** A sheet name inside a formula: always quoted, inner quotes doubled. */
const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`;

/**
 * The Cuadra template (specs/027) as an `.xlsx` Blob, in the user's language and
 * with their own accounts, cards and categories in dropdowns. `exceljs` is
 * imported on demand: it only ever loads when someone downloads a template.
 *
 * Data sheets come EMPTY — examples live on the Instructions sheet, where they
 * can never be imported by mistake.
 */
export async function buildTemplate(input: {
  refs: TemplateRefs;
  t: TFunction;
  locale: string;
}): Promise<Blob> {
  const { refs, t, locale } = input;
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Cuadra";

  // Instructions first: it's what opens.
  const help = workbook.addWorksheet(t(sheetNameKey(INSTRUCTIONS_KEY)));
  help.getColumn(1).width = 120;
  const lines: [string, boolean][] = [
    [t("import.template.instructions.title"), true],
    ["", false],
    [t("import.template.instructions.intro"), false],
    [t("import.template.instructions.rules"), false],
    [t("import.template.instructions.refs"), false],
    [t("import.template.instructions.allOrNothing"), false],
    [t("import.template.instructions.reimport"), false],
    ["", false],
    [t("import.template.instructions.exampleTitle"), true],
    ...TEMPLATE_SHEETS.map((s): [string, boolean] => [
      t(`import.template.instructions.examples.${s.key}`),
      false,
    ]),
    ["", false],
    // Every column, described — the same text each header carries as a note.
    [t("import.template.instructions.columnsTitle"), true],
    [t("import.template.instructions.columnsHint"), false],
    ...TEMPLATE_SHEETS.flatMap((s): [string, boolean][] => [
      ["", false],
      [t(sheetNameKey(s.key)), true],
      ...s.columns.map((c): [string, boolean] => [
        `• ${t(columnKey(s.key, c.key))} (${t(
          c.required
            ? "import.template.instructions.required"
            : "import.template.instructions.optional",
        )}): ${t(columnHelpKey(s.key, c.key))}`,
        false,
      ]),
    ]),
  ];
  lines.forEach(([text, bold], i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = text;
    cell.alignment = { wrapText: true, vertical: "top" };
    if (bold) cell.font = { bold: true, size: i === 0 ? 14 : 11 };
  });

  // Data sheets, created now so they sit before Reference in the tab order.
  const dataSheets = TEMPLATE_SHEETS.map((spec) => ({
    spec,
    sheet: workbook.addWorksheet(t(sheetNameKey(spec.key)), {
      views: [{ state: "frozen", ySplit: 1 }],
    }),
  }));

  // Reference: one column per list, so each dropdown points at its own range.
  const referenceName = t(sheetNameKey(REFERENCE_KEY));
  const ref = workbook.addWorksheet(referenceName);
  const lists = referenceLists(refs, t);
  const ranges = new Map<ListKey, string>();
  LIST_ORDER.forEach((key, i) => {
    const values = lists[key];
    const letter = columnLetter(i);
    ref.getColumn(i + 1).width = key === "card" || key === "account" ? 30 : 20;
    const header = ref.getCell(1, i + 1);
    header.value = t(REFERENCE_HEADERS[key]);
    header.font = { bold: true };
    values.forEach((v, row) => {
      ref.getCell(row + 2, i + 1).value = v;
    });
    if (values.length > 0) {
      ranges.set(key, `${quoted(referenceName)}!$${letter}$2:$${letter}$${values.length + 1}`);
    }
  });

  for (const { spec, sheet } of dataSheets) {
    spec.columns.forEach((column, i) => {
      const letter = columnLetter(i);
      const col = sheet.getColumn(i + 1);
      col.width = column.width ?? 18;
      if (column.kind === "date") col.numFmt = "dd/mm/yyyy";
      if (column.kind === "money") col.numFmt = "#,##0.##";
      const header = sheet.getCell(1, i + 1);
      header.value = t(columnKey(spec.key, column.key));
      header.font = { bold: true };
      header.note = t(columnHelpKey(spec.key, column.key));
      const range = column.list ? ranges.get(column.list) : undefined;
      if (range) {
        // Range-wide validation: exists at runtime, missing from exceljs' typings.
        (sheet as unknown as RangeValidations).dataValidations.add(
          `${letter}2:${letter}${DATA_ROWS + 1}`,
          {
            type: "list",
            allowBlank: !column.required,
            formulae: [range],
            showErrorMessage: false, // a typed value is still read; the import checks it
          },
        );
      }
    });
  }

  // What marks the file as ours, and which version of the layout it follows.
  const marker = workbook.addWorksheet(MARKER_SHEET, { state: "veryHidden" });
  marker.getCell(1, 1).value = "version";
  marker.getCell(1, 2).value = TEMPLATE_VERSION;
  marker.getCell(2, 1).value = "locale";
  marker.getCell(2, 2).value = locale;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** The Reference sheet's header for each list. */
const REFERENCE_HEADERS: Record<ListKey, string> = {
  account: "import.template.reference.accounts",
  card: "import.template.reference.cards",
  category: "import.template.reference.categories",
  currency: "import.template.reference.currencies",
  movementType: columnKey("movements", "type"),
  direction: columnKey("debts", "direction"),
  planFrequency: columnKey("plans", "frequency"),
  recurrenceFrequency: columnKey("recurring", "frequency"),
  yesNo: columnKey("movements", "financeCharge"),
};
