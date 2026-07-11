import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { Card } from "../../../shared/ui/card";
import { PRIMARY_CURRENCY, type CategorySlice } from "../lib/metrics";

// Categorical palette mapped to design tokens (no hardcoded hex).
const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--info))",
  "hsl(var(--warning))",
  "hsl(var(--muted-foreground))",
];

export function CategoryDonut({ slices }: { slices: CategorySlice[] }) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState<number | null>(null);
  const fmt = (v: number) =>
    formatMoney(String(v), { locale: i18n.language, currency: PRIMARY_CURRENCY });

  const label = (c: string | null) => c ?? t("transactions.uncategorized");
  const data = slices.map((s) => ({ name: label(s.category), value: Number(s.total) }));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const hovered = active !== null ? data[active] : null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="text-sm font-semibold">{t("dashboard.spendByCategory")}</span>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.noSpend")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative h-[120px] w-[120px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={58}
                  paddingAngle={2}
                  stroke="none"
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                >
                  {data.map((d, i) => (
                    <Cell
                      key={d.name}
                      fill={PALETTE[i % PALETTE.length]}
                      fillOpacity={active === null || active === i ? 1 : 0.3}
                      style={{ transition: "fill-opacity 150ms", outline: "none" }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {hovered ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
                <span className="max-w-full truncate text-xs text-muted-foreground">
                  {hovered.name}
                </span>
                <span className="text-sm font-semibold tabular-nums">{fmt(hovered.value)}</span>
              </div>
            ) : null}
          </div>

          <ul className="scrollbar-thin flex max-h-[120px] min-w-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {data.map((d, i) => (
              <li
                key={d.name}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  "flex cursor-default items-center justify-between gap-2 rounded px-1 py-0.5 text-sm transition-colors",
                  active === i && "bg-muted",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                  />
                  <span className="truncate text-muted-foreground">{d.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {Math.round((d.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
