import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { Segmented } from "../../../shared/ui/segmented";
import {
  hasOtherHolders,
  type AccountSlice,
  type CategorySlice,
  type HolderSlice,
} from "../lib/metrics";
import { CategoryBars } from "./CategoryBars";
import { CategoryRowsSkeleton } from "./DashboardSkeleton";
import { RankedBars, type RankedBar } from "./RankedBars";

type View = "category" | "account" | "holder";

/**
 * "En qué se fue": the month's spending as ranked bars, cut by category, by account or by who
 * spent it — a compact switch beside the title picks the cut. "Titular" is only offered when
 * someone besides the owner spent with an additional card this month (with the owner alone it is
 * one bar at 100%); if it was picked and stops applying (another month), the view falls back to
 * categories.
 */
export function SpendBreakdown({
  categories,
  byAccount,
  byHolder,
  accountList,
  loading,
}: Readonly<{
  categories: CategorySlice[];
  byAccount: AccountSlice[];
  byHolder: HolderSlice[];
  accountList: accounts.BankAccount[];
  loading: boolean;
}>) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<View>("category");
  const showHolder = hasOtherHolders(byHolder);
  const view: View = picked === "holder" && !showHolder ? "category" : picked;

  const options = [
    { value: "category" as const, label: t("dashboard.breakdown.category") },
    { value: "account" as const, label: t("dashboard.breakdown.account") },
    ...(showHolder ? [{ value: "holder" as const, label: t("dashboard.breakdown.holder") }] : []),
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="shrink-0 text-sm font-semibold">{t("dashboard.spendByCategory")}</h2>
        <Segmented<View>
          aria-label={t("dashboard.breakdown.label")}
          variant="neutral"
          size="sm"
          value={view}
          onChange={setPicked}
          options={options}
        />
      </div>
      {loading ? (
        <CategoryRowsSkeleton />
      ) : view === "category" ? (
        <CategoryBars slices={categories} />
      ) : view === "account" ? (
        <SliceBars
          rows={byAccount.map((s) => ({
            key: s.accountId ?? "__none",
            label:
              accountList.find((a) => a.id === s.accountId)?.name ??
              t("dashboard.breakdown.noAccount"),
            value: Number(s.total),
          }))}
          label={t("dashboard.breakdown.account")}
        />
      ) : (
        <SliceBars
          rows={byHolder.map((s) => ({
            key: s.holder?.toLocaleLowerCase() ?? "__owner",
            label: s.holder ?? t("dashboard.byHolder.you"),
            value: Number(s.total),
          }))}
          label={t("dashboard.byHolder.title")}
        />
      )}
    </section>
  );
}

function SliceBars({ rows, label }: Readonly<{ rows: RankedBar[]; label: string }>) {
  const { t } = useTranslation();
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">{t("dashboard.noSpend")}</p>;
  return <RankedBars rows={rows} total={total} label={label} />;
}
