import {
  Banknote,
  CalendarDays,
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

import { cn } from "../../../../shared/lib/cn";
import { Badge } from "../../../../shared/ui/badge";
import { Button } from "../../../../shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../shared/ui/card";
import { Table, TD, TH, THead, TR } from "../../../../shared/ui/table";
import { Bar, Eyebrow } from "../bits";
import { useSampleFormat } from "../../hooks/useSampleFormat";
import { ViewHeader } from "./ViewHeader";

const P = "landing.product.accounts";

export function AccountsView() {
  const { t } = useTranslation();
  const f = useSampleFormat();

  return (
    <div className="flex flex-col gap-8 py-8">
      <ViewHeader title={t(`${P}.title`)} description={t(`${P}.subtitle`)} />

      <div className="flex flex-col gap-10">
        <div className="grid max-w-5xl gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col gap-4 text-base text-muted-foreground">
            <p>
              <Trans
                i18nKey={`${P}.p1`}
                components={{ b: <strong className="font-medium text-foreground" /> }}
              />
            </p>
            <p>{t(`${P}.p2`)}</p>
            <p>{t(`${P}.p3`)}</p>
          </div>

          <Card className="p-4">
            <Eyebrow>{t(`${P}.pools.title`)}</Eyebrow>
            <div className="mt-4 flex flex-col gap-4">
              <PoolRow
                label={t(`${P}.pools.shared`)}
                figure={`${f.money(486190)} / ${f.money(1800000)}`}
                hint={t(`${P}.pools.sharedHint`)}
                tone="bg-accent"
              />
              <PoolRow
                label={t(`${P}.pools.additional`)}
                figure={`${f.money(240, "USD")} / ${f.money(900, "USD")}`}
                hint={t(`${P}.pools.additionalHint`)}
                tone="bg-primary"
              />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-5 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t(`${P}.summary.netWorth`)}{" "}
                <span className="text-dim">{t(`${P}.summary.netWorthHint`)}</span>
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                <p className="text-[26px] font-bold leading-none tracking-tight tabular-nums sm:text-[30px]">
                  {f.money(3297610)}
                </p>
                <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {f.money(310, "USD")}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 sm:gap-8">
              <div className="text-right">
                <p className="text-[11.5px] text-muted-foreground">{t(`${P}.summary.assets`)}</p>
                <p className="mt-1 text-base font-semibold tabular-nums text-success">
                  {f.money(3783800)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11.5px] text-muted-foreground">{t(`${P}.summary.cardDebt`)}</p>
                <p className="mt-1 text-base font-semibold tabular-nums text-accent">
                  {f.signed(-486190)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-dim">
                {t(`${P}.group.all`)}
                <span className="ml-2 font-normal normal-case tracking-normal">
                  {t(`${P}.group.count`, { count: 5 })}
                </span>
              </h3>
              <span className="h-px flex-1 bg-border" />
              <span className="text-[12.5px] font-semibold tabular-nums">{f.money(3297610)}</span>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
              <AccountTile
                icon={Landmark}
                type={t(`${P}.types.checking`)}
                name={t(`${P}.cards.checkingName`)}
                meta="Banco de Chile · ···· 8821"
                amount={f.money(1240000)}
                footer={<Trend value={3.2} />}
              />
              <AccountTile
                icon={PiggyBank}
                type={t(`${P}.types.savings`)}
                name={t(`${P}.cards.savingsName`)}
                meta="Coopeuch · ···· 5093"
                amount={f.money(2410000)}
                footer={<Trend value={1.4} />}
              />
              <AccountTile
                icon={CreditCard}
                type={t(`${P}.types.credit`)}
                name="Visa Signature"
                meta="BCI · ···· 4417"
                amount={f.signed(-486190)}
                credit
                footer={
                  <>
                    <p className="text-[11px] text-dim">{t(`${P}.cards.billedAt`)}</p>
                    <div className="mt-auto border-t pt-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <CreditCard
                            className="h-[11px] w-[11px] shrink-0 text-accent"
                            aria-hidden
                          />
                          <span className="truncate">{t(`${P}.cards.creditUsed`)}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">27%</span>
                      </div>
                      <Bar percent={27} tone="bg-accent" className="h-1" />
                      <p className="mt-1.5 whitespace-nowrap text-[10px] tabular-nums text-dim">
                        {f.money(486190)} / {f.money(1800000)}
                      </p>
                    </div>
                  </>
                }
              />
              <AccountTile
                icon={WalletCards}
                type={t(`${P}.types.prepaid`)}
                name="Tenpo Prepago"
                meta="Tenpo · ···· 2210"
                amount={f.money(47500)}
                footer={<Trend value={-12.5} />}
              />
              <AccountTile
                icon={Banknote}
                type={t(`${P}.types.cash`)}
                name={t(`${P}.cards.cashName`)}
                meta="CLP"
                amount={f.money(86300)}
                footer={<p className="text-[11px] text-dim">{t(`${P}.cards.cashNote`)}</p>}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t(`${P}.footnote`)}</p>
        </div>
      </div>

      <BillingBlock />
    </div>
  );
}

function PoolRow({
  label,
  figure,
  hint,
  tone,
}: Readonly<{ label: string; figure: string; hint: string; tone: string }>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{figure}</span>
      </div>
      <Bar percent={27} tone={tone} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Trend({ value }: Readonly<{ value: number }>) {
  const { t } = useTranslation();
  const f = useSampleFormat();
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p
      className={cn(
        "mt-2 flex items-center gap-1.5 text-[11px]",
        up ? "text-success" : "text-destructive",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {t(`${P}.cards.monthChange`, { value: f.percent(value) })}
    </p>
  );
}

function AccountTile({
  icon: Icon,
  type,
  name,
  meta,
  amount,
  credit,
  footer,
}: Readonly<{
  icon: typeof Landmark;
  type: string;
  name: string;
  meta: string;
  amount: string;
  credit?: boolean;
  footer: ReactNode;
}>) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-colors",
        credit ? "border-accent/30 hover:border-accent/60" : "hover:border-primary/40",
      )}
    >
      <div className="mb-3.5 flex items-start justify-between">
        <span
          className={cn(
            "flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-chip",
            credit ? "text-accent" : "text-muted-foreground",
          )}
        >
          <Icon className="h-[17px] w-[17px]" aria-hidden />
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
            credit ? "bg-accent/15 text-accent" : "bg-chip text-muted-foreground",
          )}
        >
          {type}
        </span>
      </div>
      <p className="text-[13.5px] font-semibold leading-tight">{name}</p>
      <p className="mt-0.5 text-[11px] text-dim">{meta}</p>
      <p
        className={cn(
          "mt-3 text-[19px] font-bold tracking-tight tabular-nums",
          credit && "text-accent",
        )}
      >
        {amount}
      </p>
      {footer}
    </div>
  );
}

function BillingBlock() {
  const { t } = useTranslation();
  const f = useSampleFormat();
  const B = `${P}.billing`;

  const rows = [
    {
      period: `${f.dayMonth("2026-07-21")} — ${f.dayMonth("2026-08-20")}`,
      status: <Badge variant="brand">{t(`${B}.pending`)}</Badge>,
      due: f.dayMonth("2026-09-05"),
      amount: f.money(486190),
    },
    {
      period: `${f.dayMonth("2026-06-21")} — ${f.dayMonth("2026-07-20")}`,
      status: <Badge variant="warning">{t(`${B}.partiallyPaid`)}</Badge>,
      due: f.dayMonth("2026-08-05"),
      amount: f.money(524880),
      detail: t(`${B}.partialDetail`, { paid: f.money(300000), carried: f.money(224880) }),
    },
    {
      period: `${f.dayMonth("2026-05-21")} — ${f.dayMonth("2026-06-20")}`,
      status: <Badge variant="success">{t(`${B}.paid`)}</Badge>,
      due: f.dayMonth("2026-07-05"),
      amount: f.money(398140),
    },
  ];

  return (
    <div className="flex flex-col gap-6 border-t pt-10">
      <div className="max-w-[62ch]">
        <Eyebrow>{t(`${B}.eyebrow`)}</Eyebrow>
        <h3 className="mt-2 text-lg font-semibold tracking-tight">{t(`${B}.title`)}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t(`${B}.p1`)}</p>
        <p className="mt-3 text-sm text-muted-foreground">{t(`${B}.p2`)}</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow>{t(`${B}.current`)}</Eyebrow>
              <Badge variant="brand">{t(`${B}.pending`)}</Badge>
            </div>
            <CardTitle>
              {f.dayMonth("2026-07-21")} — {f.date("2026-08-20")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{t(`${B}.total`)}</span>
                <span className="text-3xl font-bold tabular-nums">{f.money(486190)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {t(`${B}.minimum`, { percent: 15 })}
                </span>
                <span className="text-3xl font-bold tabular-nums text-accent">
                  {f.money(72929)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col divide-y">
              <BreakdownRow label={t(`${B}.purchases`)} value={f.money(312400)} />
              <BreakdownRow label={t(`${B}.installments`, { count: 2 })} value={f.money(173790)} />
              <BreakdownRow label={t(`${B}.previous`)} value={f.money(224880)} />
              <BreakdownRow label={t(`${B}.due`)} value={f.date("2026-09-05")} strong />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="accent" disabled title={t("landing.sampleAction")}>
                <Banknote className="h-4 w-4" aria-hidden />
                {t(`${B}.pay`)}
              </Button>
              <Button variant="outline" disabled title={t("landing.sampleAction")}>
                {t(`${B}.sync`)}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t(`${B}.note`)}</p>
          </CardContent>
        </Card>

        <Card>
          <Table>
            <THead className="bg-muted/50">
              <TR>
                <TH className="w-8" />
                <TH>{t(`${B}.table.period`)}</TH>
                <TH>{t(`${B}.table.status`)}</TH>
                <TH className="w-28 whitespace-nowrap">{t(`${B}.table.due`)}</TH>
                <TH numeric className="w-32">
                  {t(`${B}.table.amount`)}
                </TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((row) => (
                <TR key={row.period} className="hover:bg-muted/40">
                  <TD>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-muted-foreground">
                      <CalendarDays className="h-4 w-4" aria-hidden />
                    </span>
                  </TD>
                  <TD className="font-medium">{row.period}</TD>
                  <TD>{row.status}</TD>
                  <TD className="w-28 whitespace-nowrap text-muted-foreground">{row.due}</TD>
                  <TD numeric className="w-32">
                    {row.amount}
                    {row.detail ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {row.detail}
                      </span>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  strong,
}: Readonly<{ label: string; value: string; strong?: boolean }>) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm tabular-nums", strong && "font-medium")}>{value}</span>
    </div>
  );
}
