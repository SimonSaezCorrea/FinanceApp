import { useTranslation } from "react-i18next";

import { Card } from "../../../../shared/ui/card";
import { Table, TD, TH, THead, TR } from "../../../../shared/ui/table";
import { Eyebrow, InfoCard } from "../bits";
import { useSampleFormat } from "../../hooks/useSampleFormat";
import { ViewHeader } from "./ViewHeader";

const P = "landing.product.recurring";

export function RecurringView() {
  const { t } = useTranslation();
  const f = useSampleFormat();

  const rows = [
    {
      key: "rent",
      detail: t(`${P}.rows.rentAccount`),
      frequency: t(`${P}.monthly`),
      next: f.dayMonth("2026-09-01"),
      amount: f.money(420000),
    },
    {
      key: "netflix",
      detail: "Visa ••••4417",
      frequency: t(`${P}.monthly`),
      next: f.dayMonth("2026-09-05"),
      amount: f.money(9990),
    },
    {
      key: "carInsurance",
      detail: t(`${P}.paused`),
      frequency: t(`${P}.yearly`),
      next: f.dayMonth("2027-03-14"),
      amount: f.money(89000),
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
                  <TH>{t(`${P}.table.series`)}</TH>
                  <TH>{t(`${P}.table.frequency`)}</TH>
                  <TH className="w-28 whitespace-nowrap">{t(`${P}.table.next`)}</TH>
                  <TH numeric className="w-28">
                    {t(`${P}.table.amount`)}
                  </TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((row) => (
                  <TR key={row.key} className="hover:bg-muted/40">
                    <TD className="font-medium">
                      {t(`${P}.rows.${row.key}`)}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {row.detail}
                      </span>
                    </TD>
                    <TD className="text-muted-foreground">{row.frequency}</TD>
                    <TD className="w-28 whitespace-nowrap text-muted-foreground">{row.next}</TD>
                    <TD numeric className="w-28">
                      {row.amount}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <InfoCard title={t(`${P}.rules.reminder.title`)}>
            {t(`${P}.rules.reminder.body`)}
          </InfoCard>
          <InfoCard title={t(`${P}.rules.frequency.title`)}>
            {t(`${P}.rules.frequency.body`)}
          </InfoCard>
          <InfoCard title={t(`${P}.rules.pause.title`)}>{t(`${P}.rules.pause.body`)}</InfoCard>
        </div>
      </div>
    </div>
  );
}
