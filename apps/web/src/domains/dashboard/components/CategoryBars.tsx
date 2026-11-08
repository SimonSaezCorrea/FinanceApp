import { useTranslation } from "react-i18next";

import { useCategoryCatalog } from "../../reference/hooks/useCategoryCatalog";
import type { CategorySlice } from "../lib/metrics";
import { RankedBars } from "./RankedBars";

const SHOWN = 5;

/**
 * Where the month's spending went, as ranked bars in ONE hue (length is the comparison), the
 * amount and share beside each. Replaces the donut: six similar angles are hard to order, and a
 * categorical palette here was borrowing the status colors (green/amber/blue already mean
 * good/attention/info). The top five show by name; the rest fold into one grey "Otras" row, as
 * does spending with no category.
 */
export function CategoryBars({ slices }: Readonly<{ slices: CategorySlice[] }>) {
  const { t } = useTranslation();
  const { nameOf } = useCategoryCatalog();

  const total = slices.reduce((sum, s) => sum + Number(s.total), 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">{t("dashboard.noSpend")}</p>;

  const named = slices.filter((s) => s.categoryId !== null);
  const rest = [...named.slice(SHOWN), ...slices.filter((s) => s.categoryId === null)];
  const rows = [
    ...named.slice(0, SHOWN).map((s) => ({
      key: s.categoryId as string,
      label: nameOf(s.categoryId) ?? t("transactions.uncategorized"),
      value: Number(s.total),
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

  return <RankedBars rows={rows} total={total} label={t("dashboard.spendByCategory")} />;
}
