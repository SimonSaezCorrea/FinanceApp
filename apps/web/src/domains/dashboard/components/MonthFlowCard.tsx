import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { PRIMARY_CURRENCY, type MonthFlow } from "../lib/metrics";

/**
 * What came in and what went out this month, as two bars on ONE scale (the larger is full
 * width), so the gap between them is visible before reading a number. The sentence below says
 * the same in words. No card of its own: it sits inside the Panel's month block.
 */
export function MonthFlowSummary({ flow }: Readonly<{ flow: MonthFlow }>) {
  const { t, i18n } = useTranslation();
  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: PRIMARY_CURRENCY });
  const income = Number(flow.income);
  const expense = Number(flow.expense);
  const max = Math.max(income, expense, 1);

  const rows = [
    {
      key: "in",
      label: t("dashboard.in"),
      value: flow.income,
      width: income / max,
      tone: "bg-success",
    },
    {
      key: "out",
      label: t("dashboard.out"),
      value: flow.expense,
      width: expense / max,
      tone: "bg-destructive",
    },
  ];

  let sentence: string | null = null;
  if (income > 0 && expense > income) sentence = t("dashboard.overspent");
  else if (income > 0)
    sentence = t("dashboard.savingsSentence", { pct: Math.round(flow.savingsRate * 1000) / 10 });

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div
          key={r.key}
          className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
        >
          <span className="text-muted-foreground">{r.label}</span>
          <span className="h-2.5 overflow-hidden" aria-hidden>
            <span
              className={`block h-full rounded-r ${r.tone}`}
              style={{ width: `${(r.width * 100).toFixed(1)}%` }}
            />
          </span>
          <span className="text-right font-semibold tabular-nums">
            <MaskedAmount>{fmt(r.value)}</MaskedAmount>
          </span>
        </div>
      ))}
      {sentence ? <p className="text-sm text-muted-foreground">{sentence}</p> : null}
    </div>
  );
}
