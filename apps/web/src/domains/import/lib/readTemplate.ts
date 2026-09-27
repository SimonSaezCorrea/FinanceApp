import type { TFunction } from "i18next";

import { imports } from "@finance/contracts";

import { normalize, type Cell, type Sheet } from "./importParsing";
import { readSpreadsheet, SpreadsheetReadError } from "./readSpreadsheet";
import {
  MARKER_SHEET,
  TEMPLATE_SHEETS,
  TEMPLATE_VERSION,
  columnKey,
  sheetNameKey,
} from "./templateSpec";

/** Why a file can't be read as a template — each has its own message (FR-028). */
export type TemplateReadFailure = "notTemplate" | "outdated" | "empty" | "unreadable";

export class TemplateReadError extends Error {
  constructor(public readonly reason: TemplateReadFailure) {
    super(reason);
  }
}

/** One data row, its cells keyed by column. `row` is the Excel row number. */
export interface TemplateCellRow {
  row: number;
  cells: Record<string, Cell>;
}

export type TemplateSheetsRead = Record<imports.TemplateSheetKey, TemplateCellRow[]>;

/** The labels of both languages: a template downloaded in English still reads
 * with the app in Spanish, and vice versa. */
export type Labelers = TFunction[];

const isEmpty = (cell: Cell) => cell === null || cell === undefined || String(cell).trim() === "";

/**
 * Recognises a Cuadra template among the sheets of a workbook and returns each
 * data sheet's non-empty rows, cells keyed by column. Sheets and columns are
 * matched by their labels in EVERY language, so what's read never depends on
 * the language the app happens to be in. A column the template doesn't know is
 * ignored; one the user deleted just reads as empty.
 */
export function parseTemplateSheets(sheets: Sheet[], labelers: Labelers): TemplateSheetsRead {
  const marker = sheets.find((s) => s.name === MARKER_SHEET);
  if (!marker) throw new TemplateReadError("notTemplate");
  const versionRow = marker.matrix.find((r) => normalize(r[0] ?? null) === "version");
  if (Number(versionRow?.[1]) !== TEMPLATE_VERSION) throw new TemplateReadError("outdated");

  const read = Object.fromEntries(
    imports.TEMPLATE_SHEET_KEYS.map((k) => [k, [] as TemplateCellRow[]]),
  ) as TemplateSheetsRead;

  for (const spec of TEMPLATE_SHEETS) {
    const names = new Set(labelers.map((t) => normalize(t(sheetNameKey(spec.key)))));
    const sheet = sheets.find((s) => names.has(normalize(s.name)));
    if (!sheet || sheet.matrix.length === 0) continue;

    const header = sheet.matrix[0] ?? [];
    const columnAt = new Map<number, string>();
    header.forEach((cell, index) => {
      const text = normalize(cell);
      const column = spec.columns.find((c) =>
        labelers.some((t) => normalize(t(columnKey(spec.key, c.key))) === text),
      );
      if (column) columnAt.set(index, column.key);
    });

    sheet.matrix.slice(1).forEach((cells, i) => {
      if (cells.every(isEmpty)) return;
      const row: TemplateCellRow = { row: i + 2, cells: {} };
      columnAt.forEach((key, index) => {
        const cell = cells[index] ?? null;
        row.cells[key] = typeof cell === "string" ? cell.trim() || null : cell;
      });
      if (Object.values(row.cells).every(isEmpty)) return;
      read[spec.key].push(row);
    });
  }

  if (imports.TEMPLATE_SHEET_KEYS.every((k) => read[k].length === 0)) {
    throw new TemplateReadError("empty");
  }
  return read;
}

/** Reads an uploaded file as a Cuadra template. */
export async function readTemplate(file: File, labelers: Labelers): Promise<TemplateSheetsRead> {
  let sheets: Sheet[];
  try {
    sheets = await readSpreadsheet(file);
  } catch (error) {
    if (error instanceof SpreadsheetReadError) {
      // A CSV or an old .xls can't carry the marker sheet: not a template.
      const reason: TemplateReadFailure =
        error.reason === "unsupported"
          ? "notTemplate"
          : error.reason === "empty"
            ? "empty"
            : "unreadable";
      throw new TemplateReadError(reason);
    }
    throw error;
  }
  return parseTemplateSheets(sheets, labelers);
}
