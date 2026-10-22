import type {
  SimulationCurrency,
  SimulationResult,
  SimulationSystem,
} from "@finance/money/installment-simulation";

import type { Language } from "../../../lib/language";
import { formatAmount, formatPercent } from "./format";

/** Translates a key under `landing.simulator.` (Astro's `t` at build, the page's island in the
 * browser), so both render the very same text. */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface SimulatorRowView {
  n: number;
  principal: string;
  interest: string;
  costs: string;
  payment: string;
  balance: string;
}

export interface SimulatorView {
  /** One figure for cuota fija, first and last for capital constante. */
  payments: { label: string; value: string }[];
  /** "6 cuotas" (cuota fija only). */
  count: string | null;
  /** Cuota fija whose last instalment differs by rounding. */
  lastNote: string | null;
  totalPaid: string;
  interest: string;
  costs: string;
  cae: string;
  system: string;
  cash: string;
  /** What the live region announces. */
  summary: string;
  rows: SimulatorRowView[];
  totals: Omit<SimulatorRowView, "n" | "balance">;
}

function countText(installments: number, tr: Translate): string {
  return installments === 1 ? tr("results.timesOne") : tr("results.times", { count: installments });
}

/** `difference` = this total minus the other system's: positive means the other costs less. */
function systemSentence(
  difference: string,
  otherName: string,
  money: (value: string) => string,
  tr: Translate,
): string {
  if (/^-?0+(\.0+)?$/.test(difference)) return tr("system.same", { system: otherName });
  if (difference.startsWith("-")) {
    return tr("system.more", { system: otherName, amount: money(difference.slice(1)) });
  }
  return tr("system.less", { system: otherName, amount: money(difference) });
}

/** Everything the result area shows, already written for the page's language (spec 034). */
export function simulatorView(
  result: SimulationResult,
  input: { currency: SimulationCurrency; installments: number; system: SimulationSystem },
  lang: Language,
  tr: Translate,
): SimulatorView {
  const money = (value: string) => formatAmount(value, input.currency, lang);
  const fixed = input.system === "FIXED";

  const otherName = tr(fixed ? "system.constantName" : "system.fixedName");
  const system = systemSentence(result.systemDifference, otherName, money, tr);

  const { kind, extra, extraPercent } = result.cashComparison;
  let cash = tr("cash.same");
  if (kind !== "SAME") {
    cash = tr(kind === "COSTS_ONLY" ? "cash.costsOnly" : "cash.more", {
      amount: money(extra),
      percent: formatPercent(extraPercent, lang),
    });
  }

  const payments = fixed
    ? [{ label: tr("results.payment"), value: money(result.regularPayment) }]
    : [
        { label: tr("results.first"), value: money(result.firstPayment) },
        { label: tr("results.last"), value: money(result.lastPayment) },
      ];

  return {
    payments,
    count: fixed ? countText(input.installments, tr) : null,
    lastNote:
      fixed && result.lastPayment !== result.regularPayment
        ? tr("results.lastDiffers", { amount: money(result.lastPayment) })
        : null,
    totalPaid: money(result.totalPaid),
    interest: money(result.totalInterest),
    costs: money(result.costs),
    cae: formatPercent(result.caePercent, lang),
    system,
    cash,
    summary: tr("results.summary", {
      payment: payments[0]!.value,
      total: money(result.totalPaid),
      cae: formatPercent(result.caePercent, lang),
    }),
    rows: result.schedule.map((row) => ({
      n: row.sequence,
      principal: money(row.principal),
      interest: money(row.interest),
      costs: money(row.costs),
      payment: money(row.payment),
      balance: money(row.balance),
    })),
    totals: {
      principal: money(result.financed),
      interest: money(result.totalInterest),
      costs: money(result.costs),
      payment: money(result.totalPaid),
    },
  };
}
