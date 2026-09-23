import { Laptop, Refrigerator, Bot } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card } from "../../../../shared/ui/card";
import { Table, TD, TH, THead, TR } from "../../../../shared/ui/table";
import { Eyebrow, InfoCard } from "../bits";
import { useSampleFormat } from "../../hooks/useSampleFormat";
import { ViewHeader } from "./ViewHeader";

const P = "landing.product.installments";

export function InstallmentsView() {
  const { t } = useTranslation();
  const f = useSampleFormat();

  const plans = [
    {
      key: "notebook",
      icon: Laptop,
      name: "Notebook ASUS",
      detail: t(`${P}.plans.notebook`, { amount: f.money(107500) }),
      progress: t(`${P}.plans.notebookProgress`),
      card: "••••4417",
      remaining: f.money(967500),
    },
    {
      key: "fridge",
      icon: Refrigerator,
      name: "Refrigerador Mademsa",
      detail: t(`${P}.plans.fridge`, { amount: f.money(89900) }),
      progress: t(`${P}.plans.fridgeProgress`),
      card: "••••4417",
      remaining: f.money(359600),
    },
    {
      key: "vacuum",
      icon: Bot,
      name: t(`${P}.plans.vacuumName`),
      detail: t(`${P}.plans.vacuum`),
      progress: t(`${P}.plans.vacuumProgress`),
      card: "••••8821",
      remaining: f.money(106600),
    },
  ];

  const kpis = [
    { label: t(`${P}.kpis.active`), value: "3" },
    { label: t(`${P}.kpis.toPay`), value: f.money(1331100) },
    { label: t(`${P}.kpis.next`), value: f.money(107500) },
  ];

  return (
    <div className="flex flex-col gap-8 py-8">
      <ViewHeader
        title={t(`${P}.title`)}
        description={t(`${P}.subtitle`, { date: f.date("2026-09-05") })}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.7fr)] lg:gap-10">
        <div className="flex flex-col gap-3">
          <Eyebrow>{t(`${P}.title`)}</Eyebrow>
          <div className="grid gap-3 sm:grid-cols-3">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="p-4">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{kpi.value}</p>
              </Card>
            ))}
          </div>
          <Card>
            <Table>
              <THead className="bg-muted/50">
                <TR>
                  <TH className="w-8" />
                  <TH>{t(`${P}.table.plan`)}</TH>
                  <TH>{t(`${P}.table.installments`)}</TH>
                  <TH className="w-28">{t(`${P}.table.card`)}</TH>
                  <TH numeric className="w-32">
                    {t(`${P}.table.remaining`)}
                  </TH>
                </TR>
              </THead>
              <tbody>
                {plans.map((plan) => (
                  <TR key={plan.key} className="hover:bg-muted/40">
                    <TD>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-muted-foreground">
                        <plan.icon className="h-4 w-4" aria-hidden />
                      </span>
                    </TD>
                    <TD className="font-medium">
                      {plan.name}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {plan.detail}
                      </span>
                    </TD>
                    <TD className="text-muted-foreground">{plan.progress}</TD>
                    <TD className="w-28 tabular-nums text-muted-foreground">{plan.card}</TD>
                    <TD numeric className="w-32">
                      {plan.remaining}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <InfoCard title={t(`${P}.rules.credit.title`)}>{t(`${P}.rules.credit.body`)}</InfoCard>
          <InfoCard title={t(`${P}.rules.noCredit.title`)}>
            {t(`${P}.rules.noCredit.body`)}
          </InfoCard>
          <InfoCard title={t(`${P}.rules.delete.title`)}>{t(`${P}.rules.delete.body`)}</InfoCard>
        </div>
      </div>
    </div>
  );
}
