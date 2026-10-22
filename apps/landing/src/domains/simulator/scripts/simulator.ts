import type {
  SimulationCurrency,
  SimulationField,
  SimulationInput,
  SimulationSystem,
} from "@finance/money/installment-simulation";

import type { Language } from "../../../lib/language";
import { formatWhileTyping } from "../../../lib/typing";
import {
  CURRENCY_PREFIX,
  formatPercent,
  issueMessage,
  parseField,
  toInputText,
} from "../lib/format";
import { type SimulatorIsland, translator } from "../lib/translate";
import { type SimulatorView, simulatorView } from "../lib/view";

/**
 * The simulator page in the browser (spec 034). The HTML already shows the example solved at build;
 * this makes it live: every keystroke re-reads the fields and rewrites the result, with the SAME
 * arithmetic module the build used (`@finance/money/installment-simulation`, `decimal.js` inside),
 * loaded once the page is idle or on the first keystroke. Nothing is fetched, nothing is stored
 * (FR-020): the page works offline once loaded.
 */

type SimulationModule = typeof import("@finance/money/installment-simulation");

export interface SimulatorDeps {
  load: () => Promise<SimulationModule>;
  idle: (callback: () => void) => void;
}

const defaultDeps: SimulatorDeps = {
  load: () => import("@finance/money/installment-simulation"),
  idle: (callback) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(callback, { timeout: 3000 });
    else setTimeout(callback, 1500);
  },
};

const TEXT_FIELDS: SimulationField[] = [
  "price",
  "monthlyRatePercent",
  "stampTaxPercent",
  "fee",
  "cashPrice",
];

/** "0.3960" and "0.396" are the same rate. */
function sameDecimal(a: string, b: string): boolean {
  const norm = (s: string) => {
    const [int = "0", frac = ""] = s.split(".");
    const f = frac.replace(/0+$/, "");
    return `${int.replace(/^0+(?=\d)/, "")}${f ? `.${f}` : ""}`;
  };
  return norm(a) === norm(b);
}

export function initSimulator(root: Document = document, deps: SimulatorDeps = defaultDeps) {
  const islandEl = root.getElementById("simulator-data");
  if (!islandEl?.textContent) return null;
  const island = JSON.parse(islandEl.textContent) as SimulatorIsland;
  const lang: Language = island.lang;
  const tr = translator(island.messages);

  const field = (name: SimulationField) =>
    root.querySelector<HTMLInputElement>(`[data-sim-field="${name}"]`)!;
  const installmentsField = field("installments");
  const currencySelect = root.querySelector<HTMLSelectElement>("[data-sim-currency]")!;
  const systemRadios = [...root.querySelectorAll<HTMLInputElement>("[data-sim-system]")];
  const taxNotice = root.querySelector<HTMLElement>("[data-sim-tax-notice]");
  const taxNoticeText = root.querySelector<HTMLElement>("[data-sim-tax-notice-text]");
  const taxHint = root.querySelector<HTMLElement>('[data-sim-hint="stampTaxPercent"]');
  const out = (name: string) => root.querySelector<HTMLElement>(`[data-sim-out="${name}"]`);

  // The stamp tax follows the legal rate for the term until the person edits it (research R2).
  let touchedTax = false;
  let module: SimulationModule | null = null;
  let loading: Promise<SimulationModule> | null = null;
  const ensureModule = () => {
    loading ??= deps.load().then((m) => (module = m));
    return loading;
  };
  deps.idle(() => void ensureModule());

  const currency = () => currencySelect.value as SimulationCurrency;
  const system = () => (systemRadios.find((r) => r.checked)?.value ?? "FIXED") as SimulationSystem;
  const installments = (): number | null => {
    const digits = installmentsField.value.trim();
    if (!digits) return null;
    return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
  };

  const readInput = (): SimulationInput => ({
    price: parseField(field("price").value, lang),
    cashPrice: parseField(field("cashPrice").value, lang) || null,
    currency: currency(),
    installments: installments(),
    monthlyRatePercent: parseField(field("monthlyRatePercent").value, lang),
    system: system(),
    stampTaxPercent: touchedTax ? parseField(field("stampTaxPercent").value, lang) : undefined,
    fee: parseField(field("fee").value, lang),
  });

  const showErrors = (issues: { field: SimulationField; code: string }[]) => {
    const all: SimulationField[] = [...TEXT_FIELDS, "installments"];
    for (const name of all) {
      const issue = issues.find((i) => i.field === name);
      const input = field(name);
      const error = root.querySelector<HTMLElement>(`[data-sim-error="${name}"]`);
      if (issue) {
        const { key, params } = issueMessage(issue as never, currency());
        input.setAttribute("aria-invalid", "true");
        if (error) {
          error.textContent = tr(key.replace("landing.simulator.", ""), params);
          error.hidden = false;
        }
      } else {
        input.removeAttribute("aria-invalid");
        if (error) {
          error.textContent = "";
          error.hidden = true;
        }
      }
    }
  };

  const setVisible = (ok: boolean) => {
    root.querySelector<HTMLElement>("[data-sim-incomplete]")!.hidden = ok;
    root.querySelector<HTMLElement>("[data-sim-results]")!.hidden = !ok;
    const table = root.querySelector<HTMLElement>("[data-sim-table]");
    if (table) table.hidden = !ok;
  };

  const renderView = (view: SimulatorView) => {
    const payments = root.querySelector<HTMLElement>("[data-sim-payments]")!;
    payments.replaceChildren(
      ...view.payments.map((p) => {
        const wrap = root.createElement("div");
        wrap.className = "flex flex-col";
        const dt = root.createElement("dt");
        dt.className = "text-sm text-muted-foreground";
        dt.textContent = p.label;
        const dd = root.createElement("dd");
        dd.className = "text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl";
        dd.textContent = p.value;
        wrap.append(dt, dd);
        return wrap;
      }),
    );
    for (const [name, value] of Object.entries({
      count: view.count ?? "",
      lastNote: view.lastNote ? ` ${view.lastNote}` : "",
      totalPaid: view.totalPaid,
      interest: view.interest,
      costs: view.costs,
      cae: view.cae,
      system: view.system,
      cash: view.cash,
    })) {
      const el = out(name);
      if (el) el.textContent = value;
    }
    const live = root.querySelector<HTMLElement>("[data-sim-live]");
    if (live) live.textContent = view.summary;

    const rows = root.querySelector<HTMLElement>("[data-sim-rows]");
    if (rows) {
      rows.replaceChildren(
        ...view.rows.map((r) => {
          const tr = root.createElement("tr");
          tr.className = "border-t";
          const th = root.createElement("th");
          th.scope = "row";
          th.className = "px-3 py-2 text-left font-normal tabular-nums";
          th.textContent = String(r.n);
          tr.append(th);
          for (const value of [r.principal, r.interest, r.costs, r.payment, r.balance]) {
            const td = root.createElement("td");
            td.className = "px-3 py-2 text-right tabular-nums";
            td.textContent = value;
            tr.append(td);
          }
          return tr;
        }),
      );
    }
    for (const [name, value] of Object.entries(view.totals)) {
      const el = root.querySelector<HTMLElement>(`[data-sim-total="${name}"]`);
      if (el) el.textContent = value;
    }
  };

  /** The legal rate for the term in the field (until edited), its hint, and the "differs" notice. */
  const syncTax = (mod: SimulationModule, input: SimulationInput) => {
    const n = input.installments;
    if (n === null || !Number.isInteger(n) || n < 1 || n > 60) return;
    const legal = mod.stampTaxRate(n);
    const legalText = formatPercent(legal, lang, 3).replace(/\s?%$/, "");
    if (taxHint) taxHint.textContent = tr("form.stampTaxHint", { count: n, rate: legalText });
    if (!touchedTax) field("stampTaxPercent").value = toInputText(legal, lang);
    const typed = input.stampTaxPercent;
    const differs = touchedTax && !sameDecimal(typed === "" ? "0" : (typed ?? legal), legal);
    if (taxNotice) taxNotice.hidden = !differs;
    if (taxNoticeText)
      taxNoticeText.textContent = differs ? tr("form.stampTaxDiffers", { rate: legalText }) : "";
  };

  const compute = async () => {
    const mod = module ?? (await ensureModule());
    const input = readInput();
    syncTax(mod, input);
    const issues = mod.validateSimulationInput(input);
    showErrors(issues);
    if (issues.length > 0) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const result = mod.simulateInstallments(input);
    renderView(
      simulatorView(
        result,
        { currency: input.currency, installments: input.installments!, system: input.system },
        lang,
        tr,
      ),
    );
  };

  const onTextInput = (name: SimulationField) => (event: Event) => {
    const input = field(name);
    const caret = input.selectionStart ?? input.value.length;
    const { data: typed, inputType } = event as InputEvent;
    const next = formatWhileTyping(input.value, caret, lang, {
      typedPoint: typed === ".",
      pasted: inputType === "insertFromPaste" || inputType === "insertFromDrop",
    });
    if (next.value !== input.value) {
      input.value = next.value;
      input.setSelectionRange(next.caret, next.caret);
    }
    if (name === "stampTaxPercent") touchedTax = true;
    void compute();
  };

  for (const name of TEXT_FIELDS) field(name).addEventListener("input", onTextInput(name));
  installmentsField.addEventListener("input", () => {
    const digits = installmentsField.value.replace(/\D/g, "");
    if (digits !== installmentsField.value) installmentsField.value = digits;
    void compute();
  });
  currencySelect.addEventListener("change", () => {
    for (const el of root.querySelectorAll<HTMLElement>("[data-sim-prefix]")) {
      el.textContent = CURRENCY_PREFIX[currency()].trim();
    }
    void compute();
  });
  for (const radio of systemRadios) radio.addEventListener("change", () => void compute());
  root.querySelector("[data-sim-use-legal]")?.addEventListener("click", () => {
    touchedTax = false;
    void compute();
  });

  return { compute };
}
