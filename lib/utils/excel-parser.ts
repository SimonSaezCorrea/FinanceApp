/**
 * Excel import column mapping
 * ---------------------------
 * Provide a JSON mapping object (or parse from a config file) describing how
 * spreadsheet columns map to normalized transaction fields.
 *
 * Example mapping JSON:
 * ```json
 * {
 *   "date": "Date",
 *   "amount": "Amount",
 *   "description": "Details",
 *   "category": "Category",
 *   "type": "Type",
 *   "currency": "Currency",
 *   "account": "Account"
 * }
 * ```
 *
 * Row semantics:
 * - `date`: parsed with JS Date (locale-sensitive); prefer ISO yyyy-mm-dd in sheets.
 * - `amount`: positive number; combine with `type` column OR sign of amount.
 * - `type`: optional — values matched case-insensitively against INCOME/EXPENSE
 *   or localized synonyms passed via options.
 * - Unmapped columns are ignored. Extra sheet columns are ignored.
 */

import * as XLSX from "xlsx";
import { z } from "zod";

export const excelColumnMappingSchema = z.object({
  date: z.string(),
  amount: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  currency: z.string().optional(),
  account: z.string().optional(),
});

export type ExcelColumnMapping = z.infer<typeof excelColumnMappingSchema>;

export type ParsedTransactionRow = {
  occurredAt: Date;
  amount: number;
  description?: string;
  category?: string;
  type: "INCOME" | "EXPENSE";
  currency?: string;
  account?: string;
};

export type ParseExcelOptions = {
  mapping: ExcelColumnMapping;
  /** Sheet name or 0-based index (default: first sheet). */
  sheet?: string | number;
  incomeSynonyms?: string[];
  expenseSynonyms?: string[];
};

const defaultIncome = ["income", "credit", "ingreso"];
const defaultExpense = ["expense", "debit", "gasto"];

function normalizeType(
  raw: string | undefined,
  opts: ParseExcelOptions,
): "INCOME" | "EXPENSE" {
  if (!raw) return "EXPENSE";
  const v = raw.trim().toLowerCase();
  const income = [...defaultIncome, ...(opts.incomeSynonyms ?? [])].map((s) =>
    s.toLowerCase(),
  );
  const expense = [...defaultExpense, ...(opts.expenseSynonyms ?? [])].map((s) =>
    s.toLowerCase(),
  );
  if (income.includes(v)) return "INCOME";
  if (expense.includes(v)) return "EXPENSE";
  if (v === "inc" || v === "cr") return "INCOME";
  return "EXPENSE";
}

export function parseExcelTransactions(
  buffer: ArrayBuffer,
  opts: ParseExcelOptions,
): ParsedTransactionRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet =
    typeof opts.sheet === "number"
      ? workbook.Sheets[workbook.SheetNames[opts.sheet] ?? ""]
      : workbook.Sheets[opts.sheet ?? workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("Sheet not found");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const mapping = excelColumnMappingSchema.parse(opts.mapping);

  return rows.map((row, idx) => {
    const dateRaw = row[mapping.date];
    const amountRaw = row[mapping.amount];

    const occurredAt =
      dateRaw instanceof Date ? dateRaw : new Date(String(dateRaw ?? ""));
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error(`Invalid date on row ${idx + 2}`);
    }

    let amount = Number(String(amountRaw ?? "").replace(/,/g, ""));
    if (!Number.isFinite(amount)) {
      throw new Error(`Invalid amount on row ${idx + 2}`);
    }

    let type: "INCOME" | "EXPENSE" = "EXPENSE";
    if (mapping.type && row[mapping.type] != null) {
      type = normalizeType(String(row[mapping.type]), opts);
    } else if (amount < 0) {
      type = "EXPENSE";
      amount = Math.abs(amount);
    } else {
      type = "INCOME";
    }

    const description = mapping.description
      ? String(row[mapping.description] ?? "").trim() || undefined
      : undefined;
    const category = mapping.category
      ? String(row[mapping.category] ?? "").trim() || undefined
      : undefined;
    const currency = mapping.currency
      ? String(row[mapping.currency] ?? "").trim() || undefined
      : undefined;
    const account = mapping.account
      ? String(row[mapping.account] ?? "").trim() || undefined
      : undefined;

    return {
      occurredAt,
      amount,
      description,
      category,
      type,
      currency,
      account,
    };
  });
}
