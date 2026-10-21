import type { ExchangeCurrency, ExchangeRate } from "@finance/contracts/exchange-rate-rules";
import { isCarried } from "@finance/contracts/exchange-rate-rules";
import { formatPercentChange, formatRate, formatRateChange } from "@finance/money/rate-format";

import { API_URL } from "../../../lib/config";
import type { Language } from "../../../lib/language";
import { chileDay, daysBefore, formatDay } from "../lib/chileDay";
import { type DateNotice, lookupDay, readDateParam, withDateParam } from "../lib/rateDate";

/**
 * The indicator pages and the home block, in the browser (spec 033). The HTML already shows the
 * value of the day the site was BUILT with; this only makes it current and interactive:
 *
 * - on arrival (and when a tab comes back on a later Chile day) it asks the public endpoint for the
 *   last week and rewrites the headline when there is a newer row (FR-006, R5);
 * - the 30-day/1-year switch fills the 1-year table from the page's JSON island on first use;
 * - the date input shows that day's value and keeps it in `?fecha=`/`?date=` (FR-009);
 * - the converter (FR-010) loads `decimal.js` on the first keystroke.
 *
 * Nothing here blocks the first paint, and every failure leaves the page as it was built.
 */

/** What the page tells the script, in `<script type="application/json" id="rates-data">`. */
export interface RatesData {
  lang: Language;
  /** The page's currency; absent on the home block (both). */
  currency?: ExchangeCurrency;
  /** Chile's day the page was built for. */
  today: string;
  /** Oldest recorded day of the page's currency. */
  first: string | null;
  /** The rows the page carries, newest first. */
  rows: ExchangeRate[];
  /** Localized templates with `{{name}}` placeholders. */
  strings: Record<string, string>;
}

export interface RatesDeps {
  fetcher: (url: string, init: RequestInit) => Promise<Response>;
  now: () => Date;
  loadChange: () => Promise<typeof import("../lib/rateChange")>;
  loadConverter: () => Promise<typeof import("../lib/converter")>;
}

const defaultDeps: RatesDeps = {
  fetcher: (url, init) => fetch(url, init),
  now: () => new Date(),
  loadChange: () => import("../lib/rateChange"),
  loadConverter: () => import("../lib/converter"),
};

const REFRESH_TIMEOUT_MS = 3000;
const REFRESH_DAYS = 7;

export function fill(template: string | undefined, vars: Record<string, string>): string {
  return (template ?? "").replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

export function readData(root: ParentNode = document): RatesData | null {
  const el = root.querySelector("#rates-data");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as RatesData;
  } catch {
    return null;
  }
}

/** Newer by day, then by publication (a carried row replaced by the real one). */
function isNewer(a: ExchangeRate, b: ExchangeRate | null): boolean {
  if (!b) return true;
  return a.date > b.date || (a.date === b.date && a.valueDate > b.valueDate);
}

function newest(rows: readonly ExchangeRate[], currency: ExchangeCurrency): ExchangeRate | null {
  let best: ExchangeRate | null = null;
  for (const r of rows) if (r.currency === currency && isNewer(r, best)) best = r;
  return best;
}

/** Rows merged by (currency, date), the newer publication winning; newest first. */
function merge(rows: readonly ExchangeRate[], incoming: readonly ExchangeRate[]): ExchangeRate[] {
  const byKey = new Map<string, ExchangeRate>();
  for (const r of [...rows, ...incoming]) {
    const key = `${r.currency}|${r.date}`;
    const current = byKey.get(key);
    if (!current || r.valueDate >= current.valueDate) byKey.set(key, r);
  }
  return [...byKey.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

async function fetchRates(
  deps: RatesDeps,
  query: Record<string, string>,
): Promise<ExchangeRate[] | null> {
  try {
    const url = `${API_URL}/api/v1/public/exchange-rates?${new URLSearchParams(query)}`;
    const res = await deps.fetcher(url, { signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: unknown };
    return Array.isArray(body.items) ? (body.items as ExchangeRate[]) : null;
  } catch {
    return null;
  }
}

/**
 * Writes one currency's headline (`[data-rate-root][data-currency]`): the label, value, change and
 * carried notice of `row` — the same label for today and for a chosen date.
 */
export async function renderHeadline(
  root: Element,
  row: ExchangeRate,
  rows: readonly ExchangeRate[],
  data: RatesData,
  deps: RatesDeps,
): Promise<void> {
  const { lang, strings } = data;
  const set = (selector: string, text: string) => {
    const el = root.querySelector(selector);
    if (el) el.textContent = text;
  };
  set("[data-rate-label]", fill(strings.valueFor, { date: formatDay(row.date, lang) }));
  set("[data-rate-value]", formatRate(row.value, lang));
  root.querySelector("[data-rate-unavailable]")?.setAttribute("hidden", "");
  root.querySelector("[data-rate-body]")?.removeAttribute("hidden");

  const carried = root.querySelector<HTMLElement>("[data-rate-carried]");
  if (carried) {
    carried.hidden = !isCarried(row);
    carried.textContent = isCarried(row)
      ? fill(strings.carried, { date: formatDay(row.valueDate, lang) })
      : "";
  }

  const changeEl = root.querySelector<HTMLElement>("[data-rate-change]");
  if (changeEl) {
    const { rateChange } = await deps.loadChange();
    const change = rateChange(rows, row);
    changeEl.hidden = change === null;
    if (change) {
      const date = formatDay(change.previous.date, lang);
      changeEl.textContent =
        Number(change.change) === 0
          ? fill(strings.noChange, { date })
          : fill(strings.change, {
              amount: formatRateChange(change.change, lang),
              percent: formatPercentChange(change.percent, lang),
              date,
            });
    }
  }
}

/** Arrival refresh for every headline on the page (one per currency). Returns the merged rows. */
export async function refresh(
  data: RatesData,
  deps: RatesDeps,
  root: ParentNode,
  onNewer: (currency: ExchangeCurrency, row: ExchangeRate) => void = () => {},
): Promise<void> {
  const today = chileDay(deps.now());
  const query: Record<string, string> = { from: daysBefore(today, REFRESH_DAYS), to: today };
  if (data.currency) query.currency = data.currency;
  const incoming = await fetchRates(deps, query);
  if (!incoming) return;
  const shownBefore = new Map<ExchangeCurrency, ExchangeRate | null>();
  for (const c of ["USD", "CLF"] as const) shownBefore.set(c, newest(data.rows, c));
  data.rows = merge(data.rows, incoming);
  for (const c of ["USD", "CLF"] as const) {
    const latest = newest(data.rows, c);
    const headline = root.querySelector(`[data-rate-root][data-currency="${c}"]`);
    if (!latest || !headline || !isNewer(latest, shownBefore.get(c) ?? null)) continue;
    onNewer(c, latest);
    if (headline.hasAttribute("data-rate-pinned")) continue;
    await renderHeadline(headline, latest, data.rows, data, deps);
  }
}

/** Refreshes on arrival and again when the tab comes back on a later Chile day. */
function watchRefresh(
  data: RatesData,
  deps: RatesDeps,
  doc: Document,
  onNewer?: (currency: ExchangeCurrency, row: ExchangeRate) => void,
): void {
  let checkedOn = chileDay(deps.now());
  void refresh(data, deps, doc, onNewer);
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState !== "visible") return;
    const today = chileDay(deps.now());
    if (today === checkedOn) return;
    checkedOn = today;
    void refresh(data, deps, doc, onNewer);
  });
}

/** The home block: both headlines, refreshed. */
export function initRatesHome(doc: Document = document, deps: RatesDeps = defaultDeps): void {
  const data = readData(doc);
  if (!data) return;
  watchRefresh(data, deps, doc);
}

/** An indicator page: headline, period switch, date, converter. */
export function initRatePage(
  doc: Document = document,
  deps: RatesDeps = defaultDeps,
  win: Pick<Window, "location" | "history"> = window,
): void {
  const data = readData(doc);
  const currency = data?.currency;
  if (!data || !currency) return;
  const headline = doc.querySelector(`[data-rate-root][data-currency="${currency}"]`);
  const notice = doc.querySelector<HTMLElement>("[data-rate-notice]");
  const backToToday = doc.querySelector<HTMLButtonElement>("[data-rate-today]");
  const dateInput = doc.querySelector<HTMLInputElement>("[data-rate-date-input]");

  // The rate the converter uses: today's, or the chosen day's.
  let rateInUse = newest(data.rows, currency);

  const showNotice = (text: string | null) => {
    if (!notice) return;
    notice.hidden = !text;
    notice.textContent = text ?? "";
  };

  const converter = initConverter(doc, data, deps, () => rateInUse);

  const showToday = async () => {
    headline?.removeAttribute("data-rate-pinned");
    backToToday?.setAttribute("hidden", "");
    rateInUse = newest(data.rows, currency);
    if (headline && rateInUse) await renderHeadline(headline, rateInUse, data.rows, data, deps);
    converter.recompute();
  };

  const showDay = async (day: string) => {
    headline?.setAttribute("data-rate-pinned", "");
    backToToday?.removeAttribute("hidden");
    let { row, needsFetch } = lookupDay(data.rows, day, data.first);
    if (needsFetch) {
      showNotice(data.strings.loading ?? null);
      const fetched = await fetchRates(deps, { currency, from: daysBefore(day, 7), to: day });
      if (!fetched) {
        showNotice(data.strings.failed ?? null);
        return;
      }
      data.rows = merge(data.rows, fetched);
      row = data.rows.find((r) => r.currency === currency && r.date === day) ?? null;
    }
    if (!row) {
      showNotice(data.strings.noData ?? null);
      return;
    }
    showNotice(null);
    rateInUse = row;
    if (headline) await renderHeadline(headline, row, data.rows, data, deps);
    converter.recompute();
  };

  // A day in the link.
  const { day, notice: linkNotice } = readDateParam(win.location.search, data.lang, data.today);
  const NOTICES: Record<Exclude<DateNotice, null>, string> = {
    invalid: "invalid",
    future: "future",
  };
  if (linkNotice) showNotice(data.strings[NOTICES[linkNotice]] ?? null);
  if (day) {
    if (dateInput) dateInput.value = day;
    void showDay(day);
  }

  dateInput?.addEventListener("change", () => {
    const value = dateInput.value;
    win.history.replaceState(null, "", withDateParam(win.location.href, data.lang, value || null));
    if (value) void showDay(value);
    else {
      showNotice(null);
      void showToday();
    }
  });

  backToToday?.addEventListener("click", () => {
    if (dateInput) dateInput.value = "";
    win.history.replaceState(null, "", withDateParam(win.location.href, data.lang, null));
    showNotice(null);
    void showToday();
  });

  initPeriodSwitch(doc, data);

  watchRefresh(data, deps, doc, (c, row) => {
    if (c === currency && !headline?.hasAttribute("data-rate-pinned")) {
      rateInUse = row;
      converter.recompute();
    }
  });
}

/** 30 days / 1 year. The charts switch in CSS; the 1-year table is filled here on first use. */
function initPeriodSwitch(doc: Document, data: RatesData): void {
  const tbody = doc.querySelector<HTMLTableSectionElement>("[data-year-rows]");
  let filled = false;
  for (const radio of doc.querySelectorAll<HTMLInputElement>('input[name="rate-period"]')) {
    radio.addEventListener("change", () => {
      if (radio.value !== "365" || filled || !tbody || !data.currency) return;
      filled = true;
      const rows = data.rows.filter((r) => r.currency === data.currency);
      tbody.replaceChildren(...rows.map((r) => tableRow(doc, r, data)));
    });
  }
}

function tableRow(doc: Document, r: ExchangeRate, data: RatesData): HTMLTableRowElement {
  const tr = doc.createElement("tr");
  const cell = (text: string, className = "") => {
    const td = doc.createElement("td");
    td.textContent = text;
    td.className = className;
    tr.append(td);
  };
  cell(formatDay(r.date, data.lang, "short"), "py-2 pr-4");
  cell(formatRate(r.value, data.lang), "py-2 pr-4 text-right tabular-nums");
  cell(
    isCarried(r) ? (data.strings.carriedLabel ?? "") : (data.strings.publishedLabel ?? ""),
    isCarried(r) ? "py-2 text-warning" : "py-2 text-muted-foreground",
  );
  return tr;
}

/** Pesos ↔ unit. `recompute` re-runs the last edited side (the rate changed). */
function initConverter(
  doc: Document,
  data: RatesData,
  deps: RatesDeps,
  rate: () => ExchangeRate | null,
): { recompute: () => void } {
  const unit = doc.querySelector<HTMLInputElement>("[data-conv-unit]");
  const pesos = doc.querySelector<HTMLInputElement>("[data-conv-pesos]");
  const using = doc.querySelector<HTMLElement>("[data-conv-using]");
  const error = doc.querySelector<HTMLElement>("[data-conv-error]");
  const currency = data.currency;
  if (!unit || !pesos || !currency) return { recompute: () => {} };
  let lastEdited: "unit" | "pesos" | null = null;

  const showUsing = () => {
    const r = rate();
    if (using && r) {
      using.textContent = fill(data.strings.using, {
        date: formatDay(r.date, data.lang),
        value: formatRate(r.value, data.lang),
      });
    }
  };

  const compute = async (from: "unit" | "pesos") => {
    lastEdited = from;
    const source = from === "unit" ? unit : pesos;
    const target = from === "unit" ? pesos : unit;
    const r = rate();
    if (!r) return;
    const conv = await deps.loadConverter();
    const amount = conv.parseAmount(source.value, data.lang);
    if (error) error.hidden = amount !== null || source.value.trim() === "";
    if (amount === null) {
      target.value = "";
      return;
    }
    target.value =
      from === "unit"
        ? conv.formatAmountInput(conv.toPesos(amount, r.value), "CLP", data.lang)
        : conv.formatAmountInput(conv.fromPesos(amount, r.value, currency), currency, data.lang);
    showUsing();
  };

  unit.addEventListener("input", () => void compute("unit"));
  pesos.addEventListener("input", () => void compute("pesos"));
  return {
    recompute: () => {
      showUsing();
      if (lastEdited) void compute(lastEdited);
    },
  };
}
