import { useTranslation } from "react-i18next";

import { cn } from "../../../../shared/lib/cn";
import { Badge } from "../../../../shared/ui/badge";
import { Card } from "../../../../shared/ui/card";
import { Table, TD, TH, THead, TR } from "../../../../shared/ui/table";
import { Eyebrow, InfoCard } from "../bits";
import { useSampleFormat } from "../../hooks/useSampleFormat";
import { ViewHeader } from "./ViewHeader";

const P = "landing.product.debts";

export function DebtsView() {
  const { t } = useTranslation();
  const f = useSampleFormat();

  const rows = [
    {
      key: "concert",
      badge: <Badge variant="success">{t(`${P}.owedToYou`)}</Badge>,
      amount: f.money(120000),
      tone: "text-success",
    },
    {
      key: "rent",
      badge: <Badge variant="danger">{t(`${P}.youOwe`)}</Badge>,
      amount: f.money(420000),
      tone: "text-destructive",
    },
    {
      key: "lunch",
      badge: <Badge>{t(`${P}.settled`)}</Badge>,
      amount: f.money(0),
      tone: "text-muted-foreground",
    },
  ];

  return (
    <div className="flex flex-col gap-8 py-8">
      <ViewHeader title={t(`${P}.title`)} description={t(`${P}.subtitle`)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.7fr)] lg:gap-10">
        <div className="flex flex-col gap-3">
          <Eyebrow>{t(`${P}.eyebrow`)}</Eyebrow>
          <p className="text-sm text-muted-foreground">{t(`${P}.intro`)}</p>
          <Card>
            <Table>
              <THead className="bg-muted/50">
                <TR>
                  <TH>{t(`${P}.table.debt`)}</TH>
                  <TH>{t(`${P}.table.status`)}</TH>
                  <TH numeric className="w-32">
                    {t(`${P}.table.pending`)}
                  </TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((row) => (
                  <TR key={row.key} className="hover:bg-muted/40">
                    <TD className="font-medium">
                      {t(`${P}.rows.${row.key}.title`)}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t(`${P}.rows.${row.key}.detail`, { date: f.dayMonth("2026-08-12") })}
                      </span>
                    </TD>
                    <TD>{row.badge}</TD>
                    <TD numeric className={cn("w-32", row.tone)}>
                      {row.amount}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <InfoCard title={t(`${P}.rules.real.title`)}>{t(`${P}.rules.real.body`)}</InfoCard>
          <InfoCard title={t(`${P}.rules.undo.title`)}>{t(`${P}.rules.undo.body`)}</InfoCard>
          <InfoCard title={t(`${P}.rules.noDebt.title`)}>{t(`${P}.rules.noDebt.body`)}</InfoCard>
        </div>
      </div>
    </div>
  );
}
