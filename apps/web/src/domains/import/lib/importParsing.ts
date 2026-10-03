import { toMoney } from "@finance/money";

/**
 * Raw spreadsheet → movements, entirely in the browser. Bank exports differ in
 * everything: preamble rows before the header, column names, one signed "Monto"
 * column vs separate "Cargos"/"Abonos", Chilean `1.234.567` thousands, dates as
 * text or as real Excel dates. So nothing here assumes a layout: the header row
 * and each column's role are GUESSED (`detectHeaderRow`, `guessRoles`) and shown
 * to the user, who can correct any of them before importing.
 */

/** One cell as read from a sheet (`read-excel-file`) or a CSV (always text). */
export type Cell = string | number | boolean | Date | null;
export type Matrix = Cell[][];

/** One sheet of a workbook — a CSV is a single, nameless one. */
export interface Sheet {
  name: string;
  matrix: Matrix;
}

/**
 * What a column means for the import — every field a hand-made movement can
 * carry. The money side comes as one signed `amount` column, or separate `debit`
 * (money out) / `credit` (money in) columns, or an always-positive `amount` whose
 * sign a `type` column decides ("Cargo"/"Abono", "D"/"C"…).
 */
export type ColumnRole =
  | "ignore"
  | "date"
  | "amount"
  | "debit"
  | "credit"
  | "type"
  | "description"
  | "category"
  | "card"
  | "observation"
  | "emisor"
  | "receptor"
  | "lugar"
  | "financeCharge";

export const COLUMN_ROLES: ColumnRole[] = [
  "ignore",
  "date",
  "amount",
  "debit",
  "credit",
  "type",
  "description",
  "category",
  "card",
  "observation",
  "emisor",
  "receptor",
  "lugar",
  "financeCharge",
];

export interface ColumnMapping {
  /** Zero-based index of the header row; data starts on the next one. */
  headerRow: number;
  /** One role per column. */
  roles: ColumnRole[];
  /** Flip the sign of a single `amount` column — some exports (credit card
   * statements, typically) list charges as positive. */
  invertSign: boolean;
}

export interface ParsedRow {
  /** 1-based row number in the FILE, what the user sees in Excel. */
  sourceRow: number;
  type: "INCOME" | "EXPENSE";
  /** Positive decimal string. */
  amount: string;
  /** `yyyy-mm-dd`. */
  date: string;
  description: string;
  observation: string;
  emisor: string;
  receptor: string;
  lugar: string;
  /** The file's own words — matched to the catalogue / the account's cards later
   * (`resolveCategory`, `resolveCard`), since that needs data this module doesn't own. */
  categoryText: string;
  cardText: string;
  /** Marked as an issuer charge (interest, fee) by a `financeCharge` column. */
  financeCharge: boolean;
}

export type RowIssue = "invalidDate" | "invalidAmount" | "ambiguousAmount" | "invalidType";

export interface ParseResult {
  rows: ParsedRow[];
  /** Rows that look like movements but can't be read — shown, never imported. */
  issues: { sourceRow: number; reason: RowIssue }[];
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * RFC-4180-ish CSV: quoted fields (with `""` escapes and embedded newlines), and a
 * delimiter picked from the first lines — Chilean exports use `;` because `,` is
 * the decimal separator.
 */
export function parseCsv(text: string): Matrix {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = sample.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Header + roles
// ---------------------------------------------------------------------------

/** Lowercase, no accents, no punctuation — "Descripción" and "DESCRIPCION." match. */
export function normalize(value: Cell): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Header words per role, checked in this order. `ignore` comes first on purpose:
 * a running "Saldo" column is a number on every row and would otherwise be taken
 * for the amount. */
const ROLE_KEYWORDS: [ColumnRole, string[]][] = [
  ["ignore", ["saldo", "balance", "n operacion", "documento", "folio", "cuota"]],
  ["date", ["fecha", "date", "fec"]],
  ["type", ["tipo", "naturaleza", "type", "d c", "cargo abono"]],
  ["category", ["categoria", "rubro", "clasificacion", "category"]],
  ["card", ["tarjeta", "plastico", "card"]],
  ["observation", ["observacion", "observaciones", "nota", "notas", "comentario", "referencia"]],
  ["emisor", ["emisor", "origen", "remitente", "ordenante", "pagador"]],
  ["receptor", ["receptor", "destinatario", "beneficiario"]],
  ["lugar", ["lugar", "ciudad", "comuna", "ubicacion", "sucursal", "pais"]],
  ["financeCharge", ["interes", "intereses", "comision", "comisiones", "cargo emisor"]],
  [
    "debit",
    ["cargo", "cargos", "debito", "debitos", "giro", "giros", "egreso", "retiro", "salida"],
  ],
  ["credit", ["abono", "abonos", "credito", "creditos", "deposito", "ingreso", "entrada"]],
  ["amount", ["monto", "importe", "valor", "amount", "total"]],
  [
    "description",
    ["descripcion", "detalle", "glosa", "concepto", "movimiento", "comercio", "description"],
  ],
];

function roleFromHeader(header: Cell): ColumnRole | null {
  const text = normalize(header);
  if (!text) return null;
  const words = text.split(" ");
  for (const [role, keywords] of ROLE_KEYWORDS) {
    if (keywords.some((k) => (k.includes(" ") ? text.includes(k) : words.includes(k)))) {
      return role;
    }
  }
  return null;
}

/**
 * The header is the row, among the first 30, that names the most known columns
 * (at least two). Bank exports put the account holder, the period and the
 * account number above it; those rows name nothing.
 */
function recognizedInRow(row: Cell[]): number {
  return row.filter((cell) => {
    const role = roleFromHeader(cell);
    return role !== null && role !== "ignore";
  }).length;
}

export function detectHeaderRow(matrix: Matrix): number {
  let best = -1;
  let bestHits = 1;
  matrix.slice(0, 30).forEach((row, index) => {
    const hits = recognizedInRow(row);
    if (hits > bestHits) {
      best = index;
      bestHits = hits;
    }
  });
  if (best >= 0) return best;
  // Nothing recognisable: the first non-empty row.
  const firstFilled = matrix.findIndex((row) => row.some((c) => normalize(c) !== ""));
  return Math.max(firstFilled, 0);
}

/**
 * The sheet that most looks like a movements list — the one whose best header row
 * names the most known columns. A statement workbook often leads with a "Resumen"
 * sheet; opening on it would make the user hunt for the real one. Ties keep the
 * workbook's own order.
 */
export function pickMovementsSheet(sheets: Sheet[]): number {
  let best = 0;
  let bestScore = -1;
  sheets.forEach((sheet, index) => {
    const score = Math.max(0, ...sheet.matrix.slice(0, 30).map(recognizedInRow));
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/** Rows that carry anything at all — what a sheet tab reports as its size. */
export function filledRowCount(matrix: Matrix): number {
  return matrix.filter((row) => row.some((c) => String(c ?? "").trim() !== "")).length;
}

/** Column count across the header row and the data. */
export function columnCount(matrix: Matrix): number {
  return matrix.reduce((max, row) => Math.max(max, row.length), 0);
}

/**
 * One role per column: by header name first, then by content for what's still
 * unknown (a column where most cells parse as dates becomes the date, the longest
 * text column the description). Each role except `ignore` is used at most once.
 */
export function guessRoles(matrix: Matrix, headerRow: number): ColumnRole[] {
  const header = matrix[headerRow] ?? [];
  const width = columnCount(matrix);
  const sample = matrix.slice(headerRow + 1, headerRow + 21);
  const roles: ColumnRole[] = Array.from({ length: width }, () => "ignore");
  const taken = new Set<ColumnRole>();

  for (let col = 0; col < width; col++) {
    const role = roleFromHeader(header[col] ?? null);
    if (role && role !== "ignore" && !taken.has(role)) {
      roles[col] = role;
      taken.add(role);
    }
  }
  // A signed amount and a debit/credit pair are alternatives, not both.
  if (taken.has("amount") && (taken.has("debit") || taken.has("credit"))) {
    const index = roles.indexOf("amount");
    roles[index] = "ignore";
    taken.delete("amount");
  }

  const filled = (col: number) => sample.filter((r) => normalize(r[col] ?? null) !== "");
  if (!taken.has("date")) {
    for (let col = 0; col < width; col++) {
      if (roles[col] !== "ignore" || roleFromHeader(header[col] ?? null) === "ignore") continue;
      const cells = filled(col);
      if (
        cells.length > 0 &&
        cells.filter((r) => parseDate(r[col] ?? null)).length >= cells.length * 0.8
      ) {
        roles[col] = "date";
        taken.add("date");
        break;
      }
    }
  }
  if (!taken.has("description")) {
    let bestCol = -1;
    let bestLength = 0;
    for (let col = 0; col < width; col++) {
      if (roles[col] !== "ignore" || roleFromHeader(header[col] ?? null) === "ignore") continue;
      const cells = filled(col);
      if (cells.some((r) => parseAmount(r[col] ?? null) !== null)) continue;
      const avg = cells.reduce((sum, r) => sum + String(r[col]).length, 0) / (cells.length || 1);
      if (avg > bestLength) {
        bestLength = avg;
        bestCol = col;
      }
    }
    if (bestCol >= 0) roles[bestCol] = "description";
  }
  return roles;
}

/** Enough to build rows: a date, and either a signed amount or a debit/credit column. */
export function isMappingComplete(roles: ColumnRole[]): boolean {
  return (
    roles.includes("date") &&
    (roles.includes("amount") || roles.includes("debit") || roles.includes("credit"))
  );
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // 31/02 and friends
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * A cell as `yyyy-mm-dd`, or null. Understands real dates (an Excel date cell —
 * read as a UTC instant, so its UTC parts ARE the calendar day), Excel serial
 * numbers, and text in the day-first formats Chilean banks use
 * (`dd/mm/yyyy`, `dd-mm-yy`, `dd.mm.yyyy`) plus ISO `yyyy-mm-dd`. A trailing time
 * is ignored. Never month-first: `03/04` is the 3rd of April here.
 */
export function parseDate(cell: Cell): string | null {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return validYmd(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
  }
  if (typeof cell === "number") {
    // Excel serial: days since 1899-12-30. Plausible range only (1990–2100), so a
    // plain amount is never mistaken for a date.
    if (cell < 32874 || cell > 73051) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(cell) * 86_400_000);
    return validYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  if (typeof cell !== "string") return null;
  const text = cell.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s|$|T)/.exec(`${text} `);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return validYmd(year, Number(dmy[2]), Number(dmy[1]));
  }
  return null;
}

/**
 * A cell as a signed decimal string, or null when it isn't a number (empty cells
 * are null too). Handles `$ -12.345`, `(12.345)` and a trailing minus as negative,
 * and tells the decimal separator from the thousands one: with both present the
 * LAST one is decimal; `,` alone is decimal when followed by 1–2 digits; `.` alone
 * is thousands when it splits groups of three (`1.234.567`, the Chilean way).
 */
export function parseAmount(cell: Cell): string | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? toMoney(cell).toString() : null;
  if (typeof cell !== "string") return null;
  let text = cell.trim();
  if (!text) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }
  text = text.replace(/[$\s]|clp|usd|uf|us/gi, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    normalized =
      /,\d{1,2}$/.test(text) && text.split(",").length === 2
        ? text.replace(",", ".")
        : text.split(",").join("");
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(text) ? text.split(".").join("") : text;
  } else {
    normalized = text;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return (negative ? "-" : "") + toMoney(normalized).toString();
}

const EXPENSE_WORDS = [
  "cargo",
  "cargos",
  "debito",
  "d",
  "gasto",
  "egreso",
  "retiro",
  "giro",
  "salida",
  "compra",
  "pago",
  "-",
];
const INCOME_WORDS = [
  "abono",
  "abonos",
  "credito",
  "c",
  "ingreso",
  "deposito",
  "entrada",
  "devolucion",
  "+",
];

/** A `type` column's cell as a movement type, or null when it says neither. */
export function parseType(cell: Cell): "INCOME" | "EXPENSE" | null {
  const raw = String(cell ?? "").trim();
  if (raw === "-" || raw === "+") return raw === "-" ? "EXPENSE" : "INCOME";
  const text = normalize(cell);
  if (!text) return null;
  const first = text.split(" ")[0]!;
  if (EXPENSE_WORDS.includes(text) || EXPENSE_WORDS.includes(first)) return "EXPENSE";
  if (INCOME_WORDS.includes(text) || INCOME_WORDS.includes(first)) return "INCOME";
  return null;
}

/** A yes/no-ish cell ("Sí", "x", "1", "true", "interés"…) as a flag. */
export function parseFlag(cell: Cell): boolean {
  if (typeof cell === "boolean") return cell;
  const text = normalize(cell);
  return ["si", "s", "yes", "y", "x", "1", "true", "verdadero"].includes(text);
}

/** A category the file's text can be matched against: its id plus every name it
 * goes by (its localized names, its code). */
export interface CategoryCandidate {
  id: string;
  names: string[];
}

/**
 * The catalogue category a file's text names, or null. Exact match on the
 * normalized name first ("Supermercado" = "SUPERMERCADO" = "supermercado"), then
 * one containing the other ("Supermercados Jumbo" → Supermercado), so a bank's
 * own wording still lands when it's close.
 */
export function matchCategory(text: string, candidates: CategoryCandidate[]): string | null {
  const needle = normalize(text);
  if (!needle) return null;
  const named = candidates.map((c) => ({ id: c.id, names: c.names.map((n) => normalize(n)) }));
  const exact = named.find((c) => c.names.includes(needle));
  if (exact) return exact.id;
  const partial = named.find((c) =>
    c.names.some((n) => n.length >= 4 && (needle.includes(n) || n.includes(needle))),
  );
  return partial?.id ?? null;
}

/**
 * The account's card a file's text names, by its last four digits
 * ("•••• 4521", "XXXX-XXXX-XXXX-4521", "4521"), or null.
 */
export function matchCard(text: string, cards: { id: string; last4: string }[]): string | null {
  const digits = text.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  return cards.find((c) => c.last4 === last4)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return parseDate(cell) ?? "";
  return String(cell).trim();
}

/**
 * Applies a mapping to every data row. Rows with neither a date nor an amount
 * (blank lines, "Total", the bank's footer) are skipped silently; rows that have
 * one but not a readable other are reported as issues and left out.
 */
export function buildRows(matrix: Matrix, mapping: ColumnMapping): ParseResult {
  const { roles } = mapping;
  const col = (role: ColumnRole) => roles.indexOf(role);
  const dateCol = col("date");
  const amountCol = col("amount");
  const debitCol = col("debit");
  const creditCol = col("credit");
  const typeCol = col("type");
  const descriptionCol = col("description");

  const rows: ParsedRow[] = [];
  const issues: ParseResult["issues"] = [];

  matrix.slice(mapping.headerRow + 1).forEach((cells, offset) => {
    const sourceRow = mapping.headerRow + 2 + offset;
    const at = (i: number): Cell => (i >= 0 ? (cells[i] ?? null) : null);

    const rawDate = at(dateCol);
    const date = parseDate(rawDate);
    const amounts = {
      signed: parseAmount(at(amountCol)),
      debit: parseAmount(at(debitCol)),
      credit: parseAmount(at(creditCol)),
    };
    const hasAnyAmount = Object.values(amounts).some((a) => a !== null);
    const hasAnyAmountText = [amountCol, debitCol, creditCol].some(
      (i) => i >= 0 && cellText(at(i)) !== "",
    );

    if (!date) {
      // Only a date cell that LOOKS like a date attempt (it has digits) next to an
      // amount is a broken movement. A label with no digits ("Total", "Saldo
      // final") or a blank line is the bank's own furniture, skipped silently.
      const looksLikeDate = /\d/.test(cellText(rawDate));
      if (looksLikeDate && (hasAnyAmount || hasAnyAmountText)) {
        issues.push({ sourceRow, reason: "invalidDate" });
      }
      return;
    }

    let signed: string | null = null;
    if (amountCol >= 0 && typeCol >= 0) {
      // The type column decides the sign; the amount's own sign is ignored.
      const type = parseType(at(typeCol));
      if (!type) {
        issues.push({ sourceRow, reason: "invalidType" });
        return;
      }
      const magnitude = amounts.signed?.replace(/^-/, "") ?? null;
      signed = magnitude === null ? null : type === "EXPENSE" ? `-${magnitude}` : magnitude;
    } else if (amountCol >= 0) {
      signed = amounts.signed;
      if (signed !== null && mapping.invertSign) {
        signed = signed.startsWith("-") ? signed.slice(1) : `-${signed}`;
      }
    } else {
      const debit = amounts.debit && Number(amounts.debit) !== 0 ? amounts.debit : null;
      const credit = amounts.credit && Number(amounts.credit) !== 0 ? amounts.credit : null;
      if (debit && credit) {
        issues.push({ sourceRow, reason: "ambiguousAmount" });
        return;
      }
      // A debit column is money out whatever sign the bank printed it with.
      if (debit) signed = `-${debit.replace(/^-/, "")}`;
      else if (credit) signed = credit.replace(/^-/, "");
    }

    if (signed === null || Number(signed) === 0) {
      issues.push({ sourceRow, reason: "invalidAmount" });
      return;
    }

    const negative = signed.startsWith("-");
    rows.push({
      sourceRow,
      type: negative ? "EXPENSE" : "INCOME",
      amount: negative ? signed.slice(1) : signed,
      date,
      description: cellText(at(descriptionCol)),
      observation: cellText(at(col("observation"))),
      emisor: cellText(at(col("emisor"))),
      receptor: cellText(at(col("receptor"))),
      lugar: cellText(at(col("lugar"))),
      categoryText: cellText(at(col("category"))),
      cardText: cellText(at(col("card"))),
      financeCharge: col("financeCharge") >= 0 && parseFlag(at(col("financeCharge"))),
    });
  });

  return { rows, issues };
}
