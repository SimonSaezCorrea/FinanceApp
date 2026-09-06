import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Tabs } from "../../../shared/ui/tabs";
import type { RecurringCurrencyGroup } from "../lib/recurringMetrics";

const PALETTE = ["bg-primary", "bg-info", "bg-warning", "bg-accent"] as const;

interface Props {
  readonly groups: RecurringCurrencyGroup[];
}

/**
 * "Comprometido al mes": the big monthly figure plus a stacked bar of its top
 * categories. One card per currency (`Tabs` to switch when there's more than
 * one) — see `recurringByCurrency` for why summing currencies isn't an option.
 */
export function RecurringTotalCard({ groups }: Props) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);

  if (groups.length === 0) return null;

  const currency =
    selected !== null && groups.some((g) => g.currency === selected) ? selected : groups[0]!.currency;
  const g = groups.find((group) => group.currency === currency)!;
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency: g.currency });

  return (
    <div className="flex flex-col gap-3">
      {groups.length > 1 ? (
        <Tabs
          value={currency}
          onChange={setSelected}
          items={groups.map((group) => ({ value: group.currency, label: group.currency }))}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-6 rounded-[9.6px] border border-border bg-card p-[22px_24px]">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("recurring.total.label")}</span>
          <span className="text-[38px] font-semibold tracking-[-0.03em] tabular-nums">
            {money(g.monthlyTotal)}
          </span>
        </div>

        {g.breakdown.length > 0 ? (
          <div className="flex min-w-[280px] flex-1 flex-col gap-2">
            <div className="flex h-[10px] w-full overflow-hidden rounded-full bg-track">
              {g.breakdown.map((b, i) => (
                <div
                  key={b.category}
                  className={PALETTE[i % PALETTE.length]}
                  style={{ width: `${b.sharePct}%` }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {g.breakdown.map((b, i) => (
                <span key={b.category} className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-[2px] ${PALETTE[i % PALETTE.length]}`}
                    aria-hidden
                  />
                  {b.category || t("transactions.uncategorized")} {money(b.amount)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
