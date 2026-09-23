import { Check, PieChart, Plane } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../../shared/lib/cn";
import { Badge } from "../../../../shared/ui/badge";
import { Card, CardContent, CardHeader } from "../../../../shared/ui/card";
import { Bar, Eyebrow, InfoCard } from "../bits";
import { useSampleFormat } from "../../hooks/useSampleFormat";
import { ViewHeader } from "./ViewHeader";

const P = "landing.product.savings";

export function SavingsView() {
  const { t } = useTranslation();
  const f = useSampleFormat();

  const goals = [
    {
      key: "trip",
      icon: Plane,
      tone: "bg-primary/15 text-primary",
      bar: "bg-primary",
      badge: <Badge variant="brand">{t(`${P}.inProgress`)}</Badge>,
      saved: 1140000,
      target: 1800000,
      rows: [
        [t(`${P}.missing`), f.money(660000)],
        [t(`${P}.pace`), t(`${P}.perMonth`, { amount: f.money(120000) })],
        [t(`${P}.deadline`), f.monthYear("2026-12-01")],
      ],
    },
    {
      key: "emergency",
      icon: PieChart,
      tone: "bg-accent/15 text-accent",
      bar: "bg-accent",
      badge: <Badge variant="accent">{t(`${P}.overdue`)}</Badge>,
      saved: 2410000,
      target: 3000000,
      rows: [
        [t(`${P}.missing`), f.money(590000)],
        [t(`${P}.pace`), t(`${P}.perMonth`, { amount: f.money(65000) })],
        [t(`${P}.atThatPace`), t(`${P}.monthsLate`, { count: 9 })],
      ],
    },
    {
      key: "notebook",
      icon: Check,
      tone: "bg-success/15 text-success",
      bar: "bg-success",
      badge: <Badge variant="success">{t(`${P}.complete`)}</Badge>,
      saved: 1290000,
      target: 1290000,
      rows: [
        [t(`${P}.contributions`), "14"],
        [t(`${P}.onClose`), t(`${P}.withdrawToAccount`)],
        [t(`${P}.reversible`), t(`${P}.reversibleYes`)],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-8 py-8">
      <ViewHeader title={t(`${P}.title`)} description={t(`${P}.subtitle`)} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>{t(`${P}.totalSaved`)}</Eyebrow>
            <p className="mt-1 text-3xl font-bold tabular-nums">{f.money(3550000)}</p>
            <p className="text-sm text-muted-foreground">
              {t(`${P}.paceSummary`, { amount: f.money(185000) })}
            </p>
          </div>
          <p className="max-w-[42ch] text-sm text-muted-foreground">{t(`${P}.intro`)}</p>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-track">
          <div className="h-full w-[32%] bg-primary" />
          <div className="h-full w-[26%] bg-accent" />
          <div className="h-full w-[12%] bg-success" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <Card key={goal.key}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      goal.tone,
                    )}
                  >
                    <goal.icon className="h-5 w-5" aria-hidden />
                  </span>
                  {goal.badge}
                </div>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">
                  {t(`${P}.goals.${goal.key}`)}
                </h3>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">
                  {f.money(goal.saved)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {f.money(goal.target)}
                  </span>
                </p>
                <Bar
                  percent={Math.round((goal.saved / goal.target) * 100)}
                  tone={goal.bar}
                  className="mt-3"
                />
                <div className="mt-4 flex flex-col divide-y text-sm">
                  {goal.rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 py-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums">{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid max-w-5xl gap-4 sm:grid-cols-3">
        <InfoCard title={t(`${P}.rules.real.title`)}>{t(`${P}.rules.real.body`)}</InfoCard>
        <InfoCard title={t(`${P}.rules.pace.title`)}>{t(`${P}.rules.pace.body`)}</InfoCard>
        <InfoCard title={t(`${P}.rules.close.title`)}>{t(`${P}.rules.close.body`)}</InfoCard>
      </div>
    </div>
  );
}
