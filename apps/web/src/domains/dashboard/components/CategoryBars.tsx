import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { useCategoryCatalog } from "../../reference/hooks/useCategoryCatalog";
import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { cn } from "../../../shared/lib/cn";
import { PRIMARY_CURRENCY, type CategorySlice } from "../lib/metrics";

const SHOWN = 5;

/**
 * Where the month's spending went, as ranked bars in ONE hue (length is the comparison), the
 * amount and share beside each. Replaces the donut: six similar angles are hard to order, and a
 * categorical palette here was borrowing the status colors (green/amber/blue already mean
 * good/attention/info). The top five show by name; the rest fold into one grey "Otras" row, as
 * does spending with no category.
 */
export function CategoryBars({ slices }: Readonly<{ slices: CategorySlice[] }>) {
  const { t, i18n } = useTranslation();
  const { nameOf } = useCategoryCatalog();
  const fmt = (v: number) =>
    formatMoney(String(v), { locale: i18n.language, currency: PRIMARY_CURRENCY });

  const total = slices.reduce((sum, s) => sum + Number(s.total), 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">{t("dashboard.noSpend")}</p>;

  const named = slices.filter((s) => s.categoryId !== null);
  const rest = [...named.slice(SHOWN), ...slices.filter((s) => s.categoryId === null)];
  const rows = [
    ...named.slice(0, SHOWN).map((s) => ({
      key: s.categoryId as string,
      label: nameOf(s.categoryId) ?? t("transactions.uncategorized"),
      value: Number(s.total),
      other: false,
    })),
    ...(rest.length > 0
      ? [
          {
            key: "rest",
            label: t("dashboard.otherCategories"),
            value: rest.reduce((sum, s) => sum + Number(s.total), 0),
            other: true,
          },
        ]
      : []),
  ];
  const max = Math.max(...rows.map((r) => r.value));

  return (
    <ul className="flex flex-col gap-2" aria-label={t("dashboard.spendByCategory")}>
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
