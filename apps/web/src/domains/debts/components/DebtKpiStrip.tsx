import { ClockAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { debts } from "@finance/contracts";
import { formatMoney, subtractMoney, toMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { Tabs } from "../../../shared/ui/tabs";
import { summarizeDebts } from "../lib/debtMetrics";

interface DebtKpiStripProps {
  readonly debts: debts.Debt[];
}

/** "−$50.000" instead of Intl's plain hyphen — the handoff calls for the
 * typographic minus sign (U+2212) on the net balance figure specifically. */
function formatSigned(amount: string, currency: string, locale: string): string {
  const negative = toMoney(amount).isNegative();
  const abs = negative ? subtractMoney("0", amount) : amount;
  const formatted = formatMoney(abs, { locale, currency });
  return negative ? `−${formatted}` : formatted;
}

/**
 * The summary card: what you owe / net balance / what you're owed, a red-green
 * stacked bar showing the share that's your own debt, and a chip calling out
 * anything overdue.
 *
 * One card PER CURRENCY (the handoff's prototype assumes a single currency;
 * with no FX conversion in this app, mixing CLP and USD in one bar or one
 * "% de lo que circula" figure would describe nothing real) — same convention
 * `InstallmentKpiStrip`/the old `DebtKpiStrip` already used. With more than
 * one currency, a `Tabs` bar lets the user pick which currency's summary
 * ("window") is showing — one at a time — instead of stacking every
 * currency's card on screen at once.
 */
export function DebtKpiStrip({ debts: list }: DebtKpiStripProps) {
  const { t, i18n } = useTranslation();
  const summaries = summarizeDebts(list);
  const [selected, setSelected] = useState<string | null>(null);

  if (summaries.length === 0) return null;

  const currency =
    selected !== null && summaries.some((s) => s.currency === selected)
      ? selected
      : summaries[0]!.currency;
  const s = summaries.find((summary) => summary.currency === currency)!;

  return (
    <div className="flex flex-col gap-3">
      {summaries.length > 1 ? (
        <Tabs
          value={currency}
          onChange={setSelected}
          items={summaries.map((summary) => ({ value: summary.currency, label: summary.currency }))}
        />
      ) : null}

      <div className="flex flex-col gap-4 rounded-[9.6px] border border-border bg-card p-[22px_24px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-[3px]">
            <span className="text-xs text-muted-foreground">{t("debts.summary.youOwe")}</span>
            <span className="text-[22px] font-semibold tabular-nums text-destructive">
              {formatMoney(s.youOwe, { locale: i18n.language, currency: s.currency })}
            </span>
          </div>
          <div className="flex flex-col items-center gap-[3px]">
            <span className="text-xs text-muted-foreground">{t("debts.summary.net")}</span>
            <span
              className={cn(
                "text-[15px] font-semibold tabular-nums",
                toMoney(s.net).greaterThanOrEqualTo(0) ? "text-success" : "text-destructive",
              )}
            >
              {formatSigned(s.net, s.currency, i18n.language)}
            </span>
          </div>
          <div className="flex flex-col items-end gap-[3px]">
            <span className="text-xs text-muted-foreground">{t("debts.summary.owedYou")}</span>
            <span className="text-[22px] font-semibold tabular-nums text-success">
              {formatMoney(s.owedYou, { locale: i18n.language, currency: s.currency })}
            </span>
          </div>
        </div>

        <div className="flex h-[10px] w-full overflow-hidden rounded-full bg-track">
          <div
            className="h-full bg-destructive transition-all"
            style={{ width: `${s.oweSharePct}%` }}
          />
          <div
            className="h-full bg-success transition-all"
            style={{ width: `${100 - s.oweSharePct}%` }}
          />
        </div>

        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <span className="text-xs text-muted-foreground">
            {t("debts.summary.shareNote", { pct: s.oweSharePct })}
          </span>
          {toMoney(s.overdueSum).greaterThan(0) ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-[3px] text-xs font-medium text-destructive">
              <ClockAlert className="h-3 w-3" aria-hidden />
              {t("debts.summary.overdueChip", {
                amount: formatMoney(s.overdueSum, {
                  locale: i18n.language,
                  currency: s.currency,
                }),
              })}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
