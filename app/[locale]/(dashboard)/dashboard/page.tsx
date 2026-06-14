import { getTranslations } from "next-intl/server";

import { DashboardSpendChart } from "@/components/charts/DashboardSpendChart";

export default async function DashboardPage() {
  const t = await getTranslations("pages.dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            { key: "netThisMonth" as const, value: "$1,240.00" },
            { key: "activeDebts" as const, value: "2" },
            { key: "savingsGoals" as const, value: "3" },
          ] as const
        ).map((card) => (
          <div key={card.key} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="text-sm text-muted-foreground">{t(card.key)}</div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-medium">{t("cashFlowDemo")}</h2>
        <DashboardSpendChart />
      </div>
    </div>
  );
}
