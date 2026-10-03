import { imports, reference } from "@finance/contracts";

import type { TemplateRefs } from "./buildTemplate";
import {
  matchCategory,
  normalize,
  parseAmount,
  parseDate,
  type Cell,
  type CategoryCandidate,
} from "./importParsing";
import type { Labelers, TemplateCellRow, TemplateSheetsRead } from "./readTemplate";
import { FIXED_LISTS, TEMPLATE_SHEETS, cardLabel, valueKey, type ListKey } from "./templateSpec";

type Sheet = imports.TemplateSheetKey;

/** A problem found in the browser, before anything is sent. `code` maps to
 * `import.template.issues.<code>`; `column` is the column's key. */
export interface LocalIssue {
  sheet: Sheet;
  row: number;
  code:
    | "required"
    | "invalidDate"
    | "invalidAmount"
    | "invalidNumber"
    | "unknownAccount"
    | "ambiguousAccount"
    | "unknownCard"
    | "unknownCategory"
    | "unknownValue"
    | "duplicateRef"
    | "unknownRef";
  column: string;
  value?: string;
}

export interface ResolvedTemplate {
  request: imports.TemplateImportRequest;
  issues: LocalIssue[];
}

const iso = (ymd: string) => `${ymd}T00:00:00.000Z`;
const text = (cell: Cell | undefined): string =>
  cell === null || cell === undefined ? "" : String(cell).trim();

/**
 * Turns a read template into the API request, resolving every name to its id
 * with the same data the template was generated from, and reporting what can
 * already be told wrong here — a missing required cell, an unreadable date or
 * amount, a name that isn't one of the user's, a reference that repeats or points
 * nowhere. Business rules (balances, limits, instalment counts) stay the API's.
 */
export function resolveTemplate(
  read: TemplateSheetsRead,
  refs: TemplateRefs,
  labelers: Labelers,
): ResolvedTemplate {
  const issues: LocalIssue[] = [];

  // ── Lookups, by normalized label in every language ──────────────────────────
  const accountsByName = new Map<string, string[]>();
  for (const a of refs.accounts) {
    const key = normalize(a.name);
    accountsByName.set(key, [...(accountsByName.get(key) ?? []), a.id]);
  }
  const cardsByLabel = new Map(
    refs.cards.map((c) => [normalize(cardLabel(c.accountName, c.last4)), c.id]),
  );
  const categories: CategoryCandidate[] = refs.categories
    .filter((c) => reference.isCategorySelectable(c))
    .map((c) => ({
      id: c.id,
      names: [c.code, ...labelers.map((t) => t(`categories.${c.code}`, { defaultValue: c.code }))],
    }));
  const fixed = new Map<ListKey, Map<string, string>>();
  for (const [list, values] of Object.entries(FIXED_LISTS) as [ListKey, readonly string[]][]) {
    const map = new Map<string, string>();
    for (const value of values) {
      map.set(normalize(value), value);
      for (const t of labelers) map.set(normalize(t(valueKey(list, value))), value);
    }
    fixed.set(list, map);
  }
  const currencies = new Set(refs.currencies);

  /** Per-row reader: each getter records its own issue and returns undefined. */
  const reader = (sheet: Sheet, r: TemplateCellRow) => {
    const spec = TEMPLATE_SHEETS.find((s) => s.key === sheet)!;
    const required = (column: string) =>
      spec.columns.find((c) => c.key === column)?.required ?? false;
    let failed = false;
    const fail = (issue: Omit<LocalIssue, "sheet" | "row">) => {
      issues.push({ sheet, row: r.row, ...issue });
      failed = true;
      return undefined;
    };
    const present = (column: string): string | undefined => {
      const value = text(r.cells[column]);
      if (value) return value;
      if (required(column)) fail({ code: "required", column });
      return undefined;
    };
    return {
      get failed() {
        return failed;
      },
      str: (column: string) => present(column),
      date: (column: string) => {
        if (!present(column)) return undefined;
        const ymd = parseDate(r.cells[column] ?? null);
        return ymd ? iso(ymd) : fail({ code: "invalidDate", column });
      },
      money: (column: string, opts: { absolute?: boolean; percent?: boolean } = {}) => {
        const raw = present(column);
        if (!raw) return undefined;
        const cell = r.cells[column] ?? null;
        const isPercent = opts.percent && typeof cell === "string" && cell.trim().endsWith("%");
        let amount = parseAmount(isPercent ? (cell as string).trim().slice(0, -1) : cell);
        if (amount === null) return fail({ code: "invalidAmount", column });
        if (opts.absolute && amount.startsWith("-")) amount = amount.slice(1);
        if (isPercent) amount = String(Number(amount) / 100);
        if (!opts.percent && !(Number(amount) > 0)) return fail({ code: "invalidAmount", column });
        return amount;
      },
      int: (column: string, fallback?: number) => {
        const raw = present(column);
        if (!raw) return fallback;
        const n = Number(r.cells[column]);
        return Number.isInteger(n) && n > 0 ? n : fail({ code: "invalidNumber", column });
      },
      list: (column: string, of: ListKey, fallback?: string) => {
        const raw = present(column);
        if (!raw) return fallback;
        const value = fixed.get(of)!.get(normalize(raw));
        return value ?? fail({ code: "unknownValue", column, value: raw });
      },
      currency: (column: string) => {
        const raw = present(column);
        if (!raw) return undefined;
        const code = raw.toUpperCase();
        return currencies.has(code) ? code : fail({ code: "unknownValue", column, value: raw });
      },
      account: (column: string) => {
        const raw = present(column);
        if (!raw) return undefined;
        const ids = accountsByName.get(normalize(raw)) ?? [];
        if (ids.length === 0) return fail({ code: "unknownAccount", column, value: raw });
        if (ids.length > 1) return fail({ code: "ambiguousAccount", column, value: raw });
        return ids[0];
      },
      card: (column: string, accountId?: string) => {
        const raw = present(column);
        if (!raw) return undefined;
        const exact = cardsByLabel.get(normalize(raw));
        if (exact) return exact;
        // Just the digits ("4827", "•••• 4827"): the row's account's card, or the
        // only card with those digits.
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 4) {
          const last4 = digits.slice(-4);
          const matches = refs.cards.filter(
            (c) => c.last4 === last4 && (!accountId || c.accountId === accountId),
          );
          if (matches.length === 1) return matches[0]!.id;
        }
        return fail({ code: "unknownCard", column, value: raw });
      },
      category: (column: string) => {
        const raw = present(column);
        if (!raw) return undefined;
        return (
          matchCategory(raw, categories) ?? fail({ code: "unknownCategory", column, value: raw })
        );
      },
    };
  };

  /** Unique references within a sheet; returns the set of known ones. */
  const refsOf = (sheet: Sheet, rows: TemplateCellRow[]) => {
    const known = new Set<string>();
    for (const r of rows) {
      const raw = text(r.cells.ref);
      if (!raw) continue;
      const key = normalize(raw);
      if (known.has(key)) {
        issues.push({ sheet, row: r.row, code: "duplicateRef", column: "ref", value: raw });
      }
      known.add(key);
    }
    return known;
  };
  const checkRef = (sheet: Sheet, r: TemplateCellRow, known: Set<string>, column = "ref") => {
    const raw = text(r.cells[column]);
    if (raw && !known.has(normalize(raw))) {
      issues.push({ sheet, row: r.row, code: "unknownRef", column, value: raw });
      return false;
    }
    return true;
  };

  const request: imports.TemplateImportRequest = {
    balanceModes: [],
    movements: [],
    transfers: [],
    debts: [],
    debtPayments: [],
    plans: [],
    planPayments: [],
    recurring: [],
    goals: [],
    contributions: [],
  };

  // Recurring references first: a movement may name the series it pays.
  const recurringRefs = refsOf("recurring", read.recurring);
  for (const r of read.movements) {
    const get = reader("movements", r);
    const bankAccountId = get.account("account");
    const row = {
      row: r.row,
      occurredAt: get.date("date"),
      type: get.list("type", "movementType") as "INCOME" | "EXPENSE" | undefined,
      amount: get.money("amount", { absolute: true }),
      currency: get.currency("currency"),
      bankAccountId,
      cardId: get.card("card", bankAccountId),
      categoryId: get.category("category"),
      description: get.str("description"),
      observation: get.str("observation"),
      emisor: get.str("emisor"),
      receptor: get.str("receptor"),
      lugar: get.str("lugar"),
      financeCharge: get.list("financeCharge", "yesNo") === "YES" || undefined,
      recurringRef: get.str("recurring"),
    };
    if (checkRef("movements", r, recurringRefs, "recurring") && !get.failed) {
      request.movements.push(row as imports.TemplateMovement);
    }
  }

  for (const r of read.transfers) {
    const get = reader("transfers", r);
    const amount = get.money("amount");
    const row = {
      row: r.row,
      occurredAt: get.date("date"),
      fromAccountId: get.account("fromAccount"),
      toAccountId: get.account("toAccount"),
      outgoingAmount: amount,
      incomingAmount: get.money("incomingAmount") ?? amount,
      description: get.str("description"),
    };
    if (!get.failed) request.transfers.push(row as imports.TemplateTransfer);
  }

  const debtRefs = refsOf("debts", read.debts);
  for (const r of read.debts) {
    const get = reader("debts", r);
    const row = {
      row: r.row,
      ref: get.str("ref"),
      direction: get.list("direction", "direction"),
      counterparty: get.str("counterparty"),
      title: get.str("title"),
      principal: get.money("principal"),
      currency: get.currency("currency"),
      openedAt: get.date("openedAt"),
      dueAt: get.date("dueAt"),
      totalInstallments: get.int("installments", 1),
      frequency: get.list("frequency", "planFrequency", "MONTHLY"),
      frequencyInterval: get.int("every", 1),
      paymentAccountId: get.account("account"),
      notes: get.str("notes"),
    };
    if (!get.failed) request.debts.push(row as imports.TemplateDebt);
  }
  for (const r of read.debtPayments) {
    const get = reader("debtPayments", r);
    const row = {
      row: r.row,
      debtRef: get.str("ref"),
      paidAt: get.date("date"),
      accountId: get.account("account"),
      amount: get.money("amount"),
    };
    if (checkRef("debtPayments", r, debtRefs) && !get.failed) {
      request.debtPayments.push(row as imports.TemplateDebtPayment);
    }
  }

  const planRefs = refsOf("plans", read.plans);
  for (const r of read.plans) {
    const get = reader("plans", r);
    const row = {
      row: r.row,
      ref: get.str("ref"),
      title: get.str("title"),
      startDate: get.date("startDate"),
      totalPrincipal: get.money("totalPrincipal"),
      installmentCount: get.int("installments"),
      currency: get.currency("currency"),
      frequency: get.list("frequency", "planFrequency", "MONTHLY"),
      frequencyInterval: get.int("every", 1),
      aprPerPeriod: get.money("interest", { percent: true }),
      cardId: get.card("card"),
      categoryId: get.category("category"),
      paymentAccountId: get.account("account"),
    };
    if (!get.failed) request.plans.push(row as imports.TemplatePlan);
  }
  for (const r of read.planPayments) {
    const get = reader("planPayments", r);
    const row = {
      row: r.row,
      planRef: get.str("ref"),
      sequence: get.int("sequence"),
      paidAt: get.date("date"),
      accountId: get.account("account"),
      amount: get.money("amount"),
    };
    if (checkRef("planPayments", r, planRefs) && !get.failed) {
      request.planPayments.push(row as imports.TemplatePlanPayment);
    }
  }

  for (const r of read.recurring) {
    const get = reader("recurring", r);
    const bankAccountId = get.account("account");
    const row = {
      row: r.row,
      ref: get.str("ref"),
      label: get.str("label"),
      amount: get.money("amount"),
      currency: get.currency("currency"),
      frequency: get.list("frequency", "recurrenceFrequency"),
      interval: get.int("every", 1),
      anchorDate: get.date("anchorDate"),
      endDate: get.date("endDate"),
      bankAccountId,
      cardId: get.card("card", bankAccountId),
      categoryId: get.category("category"),
      notes: get.str("notes"),
    };
    if (!get.failed) request.recurring.push(row as imports.TemplateRecurring);
  }

  const goalRefs = refsOf("goals", read.goals);
  for (const r of read.goals) {
    const get = reader("goals", r);
    const row = {
      row: r.row,
      ref: get.str("ref"),
      title: get.str("title"),
      targetAmount: get.money("targetAmount"),
      currency: get.currency("currency"),
      deadline: get.date("deadline"),
      notes: get.str("notes"),
    };
    if (!get.failed) request.goals.push(row as imports.TemplateGoal);
  }
  for (const r of read.contributions) {
    const get = reader("contributions", r);
    const row = {
      row: r.row,
      goalRef: get.str("ref"),
      contributedAt: get.date("date"),
      amount: get.money("amount"),
      bankAccountId: get.account("account"),
    };
    if (checkRef("contributions", r, goalRefs) && !get.failed) {
      request.contributions.push(row as imports.TemplateContribution);
    }
  }

  // Undefined optional fields are dropped by JSON; keep the request tidy anyway.
  for (const key of imports.TEMPLATE_SHEET_KEYS) {
    request[key] = request[key].map((row) =>
      Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)),
    ) as never;
  }

  return { request, issues };
}
