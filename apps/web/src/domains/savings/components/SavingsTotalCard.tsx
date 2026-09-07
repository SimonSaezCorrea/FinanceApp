import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney, toMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { goalVisual } from "../lib/goalVisual";
import { sumAmounts, thisMonthTotal } from "../lib/savingsMetrics";

interface Props {
  summary: savings.SavingsSummary;
  openGoals: savings.SavingsGoal[];
  closedGoals: savings.SavingsGoal[];
  entries: savings.SavingsEntry[];
  currency: string;
}

/**
 * Tarjeta de total: ahorrado + nota, 3 stats, barra apilada por meta +
 * "Ahorro libre", leyenda — README §1b. Los montos se suman sin conversión
 * (mismo criterio que `GET /savings/summary`, que tampoco segrega por
 * moneda): el MVP asume una moneda dominante por usuario.
 */
export function SavingsTotalCard({
  summary,
  openGoals,
  closedGoals,
  entries,
  currency,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency });

  const total = toMoney(summary.totalSaved);
  const segments = openGoals
    .filter((g) => toMoney(g.savedAmount).greaterThan(0))
    .map((g) => ({
      id: g.id,
      title: g.title,
      color: goalVisual(g.id, g.color).color,
      amount: g.savedAmount,
      share: total.greaterThan(0)
        ? toMoney(g.savedAmount).dividedBy(total).times(100).toNumber()
        : 0,
    }));
  const freeShare = total.greaterThan(0)
    ? toMoney(summary.freeSavingsTotal).dividedBy(total).times(100).toNumber()
    : 0;
  const closedTotal = sumAmounts(closedGoals.map((g) => g.savedAmount));

  return (
    <Card className="flex flex-col gap-4 rounded-[9.6px] p-[22px_24px]">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("savings.total.label")}</span>
          <span className="text-[38px] font-semibold tracking-tight tabular-nums text-foreground">
            {money(summary.totalSaved)}
          </span>
          <span className="text-xs text-muted-foreground">
            {toMoney(closedTotal).greaterThan(0)
              ? t("savings.total.noteWithClosed", {
                  count: openGoals.length,
                  amount: money(closedTotal),
                })
              : t("savings.total.note", { count: openGoals.length })}
          </span>
        </div>
        <div className="flex flex-wrap gap-8">
          <Stat
            label={t("savings.total.thisMonth")}
            value={money(thisMonthTotal(entries))}
            tone="success"
          />
          <Stat
            label={t("savings.total.pace")}
            value={t("savings.total.paceValue", { amount: money(summary.pace) })}
          />
          <Stat label={t("savings.total.missing")} value={money(summary.missing)} />
        </div>
      </div>

      <div className="flex h-[10px] w-full overflow-hidden rounded-full bg-track">
        {segments.map((s) => (
          <div key={s.id} style={{ width: `${s.share}%`, backgroundColor: s.color }} />
        ))}
        <div style={{ width: `${freeShare}%` }} className="bg-track" />
      </div>

      <div className="flex flex-wrap gap-4">
        {segments.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: s.color }} />
            {s.title} {money(s.amount)}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-[2px] bg-track" />
          {t("savings.total.freeSavingsLegend")} {money(summary.freeSavingsTotal)}
        </span>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: Readonly<{ label: string; value: string; tone?: "success" }>) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-[17px] font-semibold tabular-nums ${tone === "success" ? "text-success" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}
