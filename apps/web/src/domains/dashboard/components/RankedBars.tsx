import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { PRIMARY_CURRENCY } from "../lib/metrics";

export interface RankedBar {
  key: string;
  label: string;
  value: number;
  /** A catch-all row ("Otras"): drawn grey so it never reads as one more item. */
  other?: boolean;
}

/**
 * Ranked bars in ONE hue (length is the comparison), the amount and its share of `total` beside
 * each. The Panel's "where it went" and "who spent it" blocks.
 */
export function RankedBars({
  rows,
  total,
  label,
}: Readonly<{ rows: RankedBar[]; total: number; label: string }>) {
  const { i18n } = useTranslation();
  const fmt = (v: number) =>
    formatMoney(String(v), { locale: i18n.language, currency: PRIMARY_CURRENCY });
  const max = Math.max(...rows.map((r) => r.value));

  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {rows.map((r) => {
        const pct = Math.round((r.value / total) * 1000) / 10;
        return (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm"
            title={`${r.label}: ${pct.toLocaleString(i18n.language)}%`}
          >
            <span className="truncate text-muted-foreground">{r.label}</span>
            <span className="h-2 overflow-hidden" aria-hidden>
              <span
                className={cn("block h-full rounded-r", r.other ? "bg-border2" : "bg-primary")}
                style={{ width: `${((r.value / max) * 100).toFixed(1)}%` }}
              />
            </span>
            <span className="text-right tabular-nums">
              <MaskedAmount>{fmt(r.value)}</MaskedAmount>
              <span className="ml-1.5 text-xs text-muted-foreground">
                {pct.toLocaleString(i18n.language)}%
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
