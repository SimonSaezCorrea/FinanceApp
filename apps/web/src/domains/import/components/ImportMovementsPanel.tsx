import { AlertTriangle, FileSpreadsheet, Flag, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { type accounts, imports } from "@finance/contracts";
import { formatMoney, sumMoney } from "@finance/money";

import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { ApiRequestError } from "@finance/client";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { Button } from "@finance/ui/src/shared/ui/button";
import { ResponsiveSurface } from "@finance/ui/src/shared/ui/overlay";
import { Switch } from "../../../shared/ui/switch";
import { useCategoryCatalog } from "../../reference/hooks/useCategoryCatalog";
import { useImportTransactions } from "../hooks/useImportTransactions";
import {
  buildRows,
  COLUMN_ROLES,
  columnCount,
  detectHeaderRow,
  filledRowCount,
  guessRoles,
  isMappingComplete,
  parseType,
  pickMovementsSheet,
  type Cell,
  type ColumnMapping,
  type ColumnRole,
  type Matrix,
  type RowIssue,
  type Sheet,
} from "../lib/importParsing";
import { readSpreadsheet, SpreadsheetReadError } from "../lib/readSpreadsheet";
import { resolveRows, type ResolvedRow } from "../lib/resolveRows";

/** Rows of the file drawn in the grid. The whole file is imported regardless. */
const GRID_ROWS = 200;

// Stable empties: a fresh `[]` on every render would defeat the memos below.
const NO_CARDS: accounts.BankAccount["cards"] = [];
const NO_ROWS: ResolvedRow[] = [];
const NO_ISSUES: { sourceRow: number; reason: RowIssue }[] = [];

/** "A", "B", …, "Z", "AA" — the column letters the user sees in Excel. */
function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cellLabel(cell: Cell): string {
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell ?? "").trim();
}

/** The column(s) an issue is ABOUT — the cell that gets the wavy underline. */
const ISSUE_ROLES: Record<RowIssue, ColumnRole[]> = {
  invalidDate: ["date"],
  invalidAmount: ["amount", "debit", "credit"],
  ambiguousAmount: ["debit", "credit"],
  invalidType: ["type"],
};

/** A role's chip colour: the money-sign role stands out, "don't import" recedes. */
function roleChipClass(role: ColumnRole): string {
  if (role === "ignore") return "bg-muted text-muted-foreground";
  if (role === "type") return "bg-accent/15 text-accent";
  return "bg-primary/15 text-primary";
}

/** A compact inline select for the toolbar — label and control on one line. */
function ToolbarSelect({
  label,
  value,
  onChange,
  options,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}>) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="whitespace-nowrap text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[14rem] rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: accounts.BankAccount;
}

/**
 * Imports a bank's spreadsheet export into ONE account, as a "mirror sheet": the
 * user's own spreadsheet is drawn as-is, and each column's role is picked right
 * above it (guessed by `detectHeaderRow`/`guessRoles`, always correctable). The
 * grid IS the preview — ignored columns fade, a row that can't be read is marked
 * where it breaks, a category or card the app doesn't recognise is flagged in its
 * cell — so there is no second table to cross-check. The API then applies the rows
 * like hand-made movements (balance, credit pool, movement rules), all-or-nothing.
 */
export function ImportMovementsPanel({ open, onOpenChange, account }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const importMutation = useImportTransactions();
  const idempotencyKey = useIdempotencyKey();
  const catalog = useCategoryCatalog();
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  // Applied to every row that doesn't say otherwise ("" = none).
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [defaultCardId, setDefaultCardId] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const cards = account.cards ?? NO_CARDS;
  const money = (value: string) =>
    formatMoney(value, { currency: account.currency, locale: i18n.language });

  function reset() {
    setFileName(null);
    setSheets(null);
    setSheetIndex(0);
    setMapping(null);
    setReadError(null);
    idempotencyKey.reset();
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  /** Switching sheet starts the mapping over: another sheet is another layout. */
  function openSheet(list: Sheet[], index: number) {
    const data = list[index]!.matrix;
    const headerRow = detectHeaderRow(data);
    setSheetIndex(index);
    setMapping({ headerRow, roles: guessRoles(data, headerRow), invertSign: false });
    // Another sheet is another attempt: it must not replay the previous one's result.
    idempotencyKey.reset();
  }

  async function loadFile(file: File) {
    setReading(true);
    setReadError(null);
    try {
      const read = await readSpreadsheet(file);
      setSheets(read);
      setFileName(file.name);
      openSheet(read, pickMovementsSheet(read));
    } catch (error) {
      const reason = error instanceof SpreadsheetReadError ? error.reason : "unreadable";
      setReadError(t(`import.readError.${reason}`));
    } finally {
      setReading(false);
    }
  }

  const matrix: Matrix | null = sheets?.[sheetIndex]?.matrix ?? null;
  const width = matrix ? columnCount(matrix) : 0;
  const complete = mapping ? isMappingComplete(mapping.roles) : false;
  const result = useMemo(
    () => (matrix && mapping && complete ? buildRows(matrix, mapping) : null),
    [matrix, mapping, complete],
  );

  // The catalogue in every language the file could be written in, plus its codes:
  // a Spanish statement says "Supermercado", an English export "Groceries".
  const categoryCandidates = useMemo(
    () =>
      catalog.categories.map((c) => ({
        id: c.id,
        kind: c.kind,
        isSystem: c.isSystem,
        names: [
          c.code,
          i18n.t(`categories.${c.code}`, { lng: "es" }),
          i18n.t(`categories.${c.code}`, { lng: "en" }),
        ],
      })),
    [catalog.categories, i18n],
  );
  const resolved = useMemo(
    () =>
      result
        ? resolveRows(result.rows, {
            accountType: account.type,
            categories: categoryCandidates,
            cards,
            defaultCategoryId: defaultCategoryId || null,
            defaultCardId: defaultCardId || null,
          })
        : null,
    [result, account.type, cards, categoryCandidates, defaultCategoryId, defaultCardId],
  );
  const rows = resolved?.rows ?? NO_ROWS;
  const stats = resolved?.stats ?? null;
  const issues = result?.issues ?? NO_ISSUES;
  const tooMany = rows.length > imports.IMPORT_MAX_ROWS;
  const incomes = rows.filter((r) => r.type === "INCOME");
  const expenses = rows.filter((r) => r.type === "EXPENSE");

  const rowBySource = useMemo(() => new Map(rows.map((r) => [r.sourceRow, r])), [rows]);
  const issueBySource = useMemo(
    () => new Map(issues.map((i) => [i.sourceRow, i.reason])),
    [issues],
  );

  function setHeaderRow(headerRow: number) {
    if (!matrix) return;
    setMapping({ headerRow, roles: guessRoles(matrix, headerRow), invertSign: false });
  }

  function setRole(column: number, role: ColumnRole) {
    if (!mapping) return;
    const roles = mapping.roles.map((r, i) => {
      if (i === column) return role;
      // Each role except "ignore" belongs to one column only; picking it again
      // moves it. A signed amount and a debit/credit pair are alternatives.
      if (role !== "ignore" && r === role) return "ignore";
      if (role === "amount" && (r === "debit" || r === "credit")) return "ignore";
      if ((role === "debit" || role === "credit") && r === "amount") return "ignore";
      return r;
    });
    setMapping({ ...mapping, roles });
  }

  function submit() {
    if (!result || rows.length === 0 || tooMany) return;
    const sent = rows;
    importMutation.mutate(
      {
        body: {
          bankAccountId: account.id,
          rows: sent.map((r) => ({
            type: r.type,
            amount: r.amount,
            // Local midnight, the same instant the movement form stores for a date.
            occurredAt: new Date(`${r.date}T00:00:00`).toISOString(),
            description: r.description || undefined,
            observation: r.observation || undefined,
            emisor: r.emisor || undefined,
            receptor: r.receptor || undefined,
            lugar: r.lugar || undefined,
            categoryId: r.categoryId ?? undefined,
            cardId: r.cardId ?? undefined,
            financeCharge: r.financeCharge || undefined,
          })),
        },
        idempotencyKey: idempotencyKey.current(),
      },
      {
        onSuccess: (res) => {
          toast.success(t("import.success", { count: res.imported }));
          close(false);
        },
        onError: (error: unknown) => {
          if (!(error instanceof ApiRequestError)) {
            toast.error(t("errors.INTERNAL_ERROR"));
            return;
          }
          const message = t(`errors.${error.code}`);
          // A rejected row comes back as `rows.<index>` of what was SENT — turned
          // back into the line of the user's own file.
          const match = /^rows\.(\d+)$/.exec(error.field ?? "");
          const row = match ? sent[Number(match[1])] : undefined;
          toast.error(row ? t("import.rowError", { row: row.sourceRow, message }) : message);
        },
      },
    );
  }

  const roleOptions = COLUMN_ROLES.map((role) => ({
    value: role,
    label: t(`import.roles.${role}`),
  }));
  const headerOptions = (matrix ?? []).slice(0, 30).map((row, index) => ({
    value: String(index),
    label: `${index + 1} · ${row.map(cellLabel).filter(Boolean).slice(0, 2).join(" · ").slice(0, 40)}`,
  }));
  const defaultCategoryName = defaultCategoryId ? catalog.nameOf(defaultCategoryId) : null;

  /** What a data cell shows, and how, given its column's role and its row's fate. */
  function renderCell(
    cell: Cell,
    role: ColumnRole,
    row: ResolvedRow | undefined,
    issue?: RowIssue,
  ) {
    const text = cellLabel(cell);
    const broken = issue !== undefined && ISSUE_ROLES[issue].includes(role);
    if (broken) {
      return (
        <span className="text-warning underline decoration-warning decoration-wavy underline-offset-4">
          {text || "—"}
        </span>
      );
    }
    if (role === "type" && text) {
      const type = parseType(cell);
      return (
        <span
          className={cn(
            type === "EXPENSE" && "text-destructive",
            type === "INCOME" && "text-success",
          )}
        >
          {text}
        </span>
      );
    }
    const unmatched =
      (role === "category" && row?.categoryUnmatched) || (role === "card" && row?.cardUnmatched);
    if (unmatched) {
      const fallback =
        role === "category"
          ? (defaultCategoryName ?? t("import.grid.noValue"))
          : t("import.grid.noValue");
      return (
        <span
          className="inline-flex items-center gap-1 text-warning"
          title={t("import.grid.unmatched", { fallback })}
        >
          {text}
          <Flag className="h-3 w-3" aria-label={t("import.grid.unmatched", { fallback })} />
        </span>
      );
    }
    return text || <span className="text-muted-foreground/60">—</span>;
  }

  const gridRows =
    matrix && mapping ? matrix.slice(mapping.headerRow + 1, mapping.headerRow + 1 + GRID_ROWS) : [];
  const importDisabled = !result || rows.length === 0 || tooMany || importMutation.isPending;

  return (
    <ResponsiveSurface
      open={open}
      onOpenChange={close}
      className={cn("max-w-[1400px]", matrix && "h-[92vh] max-h-[92vh]")}
      eyebrow={t("import.eyebrow", { account: account.name })}
      title={fileName ?? t("import.panelTitle")}
      description={fileName ? undefined : t("import.panelDescription")}
      headerAside={
        matrix ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-muted-foreground">
              {t("import.ready", { count: rows.length })}
              {issues.length > 0 ? (
                <>
                  {" · "}
                  <span className="text-warning">
                    {t("import.withIssues", { count: issues.length })}
                  </span>
                </>
              ) : null}
            </span>
            <Button variant="accent" disabled={importDisabled} onClick={submit}>
              {importMutation.isPending
                ? t("import.submitting")
                : t("import.submit", { count: rows.length })}
            </Button>
          </div>
        ) : undefined
      }
      footer={
        matrix ? (
          <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {result && issues.length > 0 ? (
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-warning" aria-hidden />
                {t("import.preview.issues", {
                  count: issues.length,
                  rows: issues
                    .slice(0, 6)
                    .map((i) => `${i.sourceRow} (${t(`import.issue.${i.reason}`)})`)
                    .join(", "),
                })}
              </span>
            ) : null}
            {stats && stats.categoriesUnmatched > 0 ? (
              <span className="flex items-center gap-1.5">
                <Flag className="h-3 w-3 text-warning" aria-hidden />
                {t("import.grid.categoriesUnmatched", {
                  count: stats.categoriesUnmatched,
                  fallback: defaultCategoryName ?? t("import.grid.noValue"),
                })}
              </span>
            ) : null}
            {stats && stats.cardsUnmatched > 0 ? (
              <span className="flex items-center gap-1.5">
                <Flag className="h-3 w-3 text-warning" aria-hidden />
                {t("import.preview.cardsUnmatched", { count: stats.cardsUnmatched })}
              </span>
            ) : null}
            {result && rows.length > 0 ? (
              <span className="ml-auto flex items-center gap-2">
                <span className="text-success">
                  +{money(sumMoney(incomes.map((r) => r.amount)))}
                </span>
                <span className="text-destructive">
                  −{money(sumMoney(expenses.map((r) => r.amount)))}
                </span>
              </span>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {!matrix || !mapping ? (
        <div className="mx-auto flex max-w-xl flex-col gap-3 py-6">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
            disabled={reading}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-14 text-center transition-colors hover:bg-muted/40",
              dragging && "border-primary bg-primary/5",
            )}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-chip text-muted-foreground">
              <FileSpreadsheet className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-sm font-medium">
              {reading ? t("import.pick.reading") : t("import.pick.title")}
            </span>
            <span className="text-xs text-muted-foreground">{t("import.pick.hint")}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            aria-label={t("import.pick.title")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void loadFile(file);
            }}
          />
          {readError ? (
            <p role="alert" className="text-sm text-destructive">
              {readError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-full flex-col gap-3">
          {/* Toolbar: what to do, and the settings that apply to the whole sheet. */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <p className="text-sm text-muted-foreground">{t("import.grid.hint")}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <ToolbarSelect
                label={t("import.map.headerRow")}
                value={String(mapping.headerRow)}
                onChange={(v) => setHeaderRow(Number(v))}
                options={headerOptions}
              />
              <ToolbarSelect
                label={t("import.defaults.category")}
                value={defaultCategoryId}
                onChange={setDefaultCategoryId}
                options={[
                  { value: "", label: t("recurring.form.noCategory") },
                  ...catalog.optionsFor(undefined).map((o) => ({ value: o.value, label: o.label })),
                ]}
              />
              {account.type !== "CASH" && cards.length > 0 ? (
                <ToolbarSelect
                  label={t("import.defaults.card")}
                  value={defaultCardId}
                  onChange={setDefaultCardId}
                  options={[
                    { value: "", label: t("import.defaults.noCard") },
                    ...cards.map((c) => ({ value: c.id, label: `•••• ${c.last4} · ${c.name}` })),
                  ]}
                />
              ) : null}
              {mapping.roles.includes("amount") && !mapping.roles.includes("type") ? (
                <label className="flex items-center gap-2 text-sm">
                  <span className="whitespace-nowrap text-muted-foreground">
                    {t("import.map.invertSign")}
                  </span>
                  <Switch
                    checked={mapping.invertSign}
                    onCheckedChange={(invertSign) => setMapping({ ...mapping, invertSign })}
                    aria-label={t("import.map.invertSign")}
                  />
                </label>
              ) : null}
            </div>
          </div>

          {!complete ? (
            <p className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {t("import.map.incomplete")}
            </p>
          ) : null}
          {tooMany ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {t("import.preview.tooMany", { max: imports.IMPORT_MAX_ROWS })}
            </p>
          ) : null}

          {/* The mirror sheet. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="w-10 border-b border-r border-border" aria-hidden />
                    {Array.from({ length: width }, (_, col) => (
                      <th
                        key={col}
                        className="border-b border-r border-border px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground last:border-r-0"
                      >
                        {columnLetter(col)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="border-b border-r border-border" aria-hidden />
                    {Array.from({ length: width }, (_, col) => {
                      const role = mapping.roles[col] ?? "ignore";
                      return (
                        <th
                          key={col}
                          className="border-b border-r border-border px-2 py-1.5 text-left last:border-r-0"
                        >
                          <select
                            aria-label={t("import.map.roleFor", { column: columnLetter(col) })}
                            value={role}
                            onChange={(e) => setRole(col, e.target.value as ColumnRole)}
                            className={cn(
                              "h-8 w-full min-w-[8.5rem] cursor-pointer rounded-md border-0 px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              roleChipClass(role),
                            )}
                          >
                            {roleOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </th>
                      );
                    })}
                  </tr>
                  <tr>
                    <th className="border-b border-r border-border px-2.5 py-1.5 text-right font-mono text-xs sm:text-[11px] font-normal text-muted-foreground/70">
                      {mapping.headerRow + 1}
                    </th>
                    {Array.from({ length: width }, (_, col) => (
                      <th
                        key={col}
                        className={cn(
                          "border-b border-r border-border px-2.5 py-1.5 text-left text-xs font-medium last:border-r-0",
                          mapping.roles[col] === "ignore"
                            ? "text-muted-foreground/60"
                            : "text-muted-foreground",
                        )}
                      >
                        {cellLabel(matrix[mapping.headerRow]?.[col] ?? null) ||
                          t("import.map.unnamed")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gridRows.map((cells, offset) => {
                    const sourceRow = mapping.headerRow + 2 + offset;
                    const row = rowBySource.get(sourceRow);
                    const issue = issueBySource.get(sourceRow);
                    // Neither imported nor broken: the bank's own furniture (a blank
                    // line, "Total"). Faded so it doesn't read as a movement.
                    const skipped = result !== null && !row && !issue;
                    return (
                      <tr
                        key={sourceRow}
                        className={cn(
                          "border-t border-border",
                          issue && "bg-warning/5",
                          skipped && "opacity-45",
                        )}
                      >
                        <td
                          className={cn(
                            "border-r border-border px-2.5 py-1.5 text-right font-mono text-xs sm:text-[11px]",
                            issue ? "text-warning" : "text-muted-foreground/70",
                          )}
                        >
                          {sourceRow}
                        </td>
                        {Array.from({ length: width }, (_, col) => {
                          const role = mapping.roles[col] ?? "ignore";
                          return (
                            <td
                              key={col}
                              className={cn(
                                "max-w-[16rem] truncate border-r border-border px-2.5 py-1.5 font-mono text-[13px] tabular-nums last:border-r-0",
                                role === "ignore" && "text-muted-foreground/50",
                              )}
                            >
                              {renderCell(cells[col] ?? null, role, row, issue)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Sheet tabs along the bottom edge, where a spreadsheet keeps them. */}
            {sheets && sheets.length > 1 ? (
              <div
                role="tablist"
                aria-label={t("import.sheets.title")}
                className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-t border-border bg-muted/50 px-2 py-1.5"
              >
                {sheets.map((sheet, index) => {
                  const selected = index === sheetIndex;
                  return (
                    <button
                      key={`${sheet.name}-${index}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => !selected && openSheet(sheets, index)}
                      className={cn(
                        "flex shrink-0 items-baseline gap-2 rounded-md px-3 py-1 text-sm transition-colors",
                        selected
                          ? "bg-card font-medium text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span className="max-w-[12rem] truncate">
                        {sheet.name || t("import.sheets.unnamed", { n: index + 1 })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("import.sheets.rows", { count: filledRowCount(sheet.matrix) })}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {account.type === "CREDIT_CARD"
                ? t("import.notice.creditCard")
                : t("import.notice.balance")}
            </span>
            <span className="flex items-center gap-3">
              {matrix.length - mapping.headerRow - 1 > GRID_ROWS ? (
                <span>{t("import.grid.truncated", { shown: GRID_ROWS })}</span>
              ) : null}
              <Button variant="outline" size="sm" onClick={reset}>
                <Upload className="h-4 w-4" aria-hidden />
                {t("import.changeFile")}
              </Button>
            </span>
          </div>
        </div>
      )}
    </ResponsiveSurface>
  );
}
