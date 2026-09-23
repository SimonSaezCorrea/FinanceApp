import {
  ArrowLeftRight,
  ArrowUp,
  CreditCard,
  DollarSign,
  Laptop,
  PiggyBank,
  Zap,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { cn } from "../../../../shared/lib/cn";
import { Badge } from "../../../../shared/ui/badge";
import { Card } from "../../../../shared/ui/card";
import { Table, TD, TH, THead, TR } from "../../../../shared/ui/table";
import { InfoCard } from "../bits";
import { useSampleFormat } from "../../hooks/useSampleFormat";
import { MonthKpiStrip } from "../MonthKpiStrip";
import { ViewHeader } from "./ViewHeader";

const P = "landing.product.movements";

type Kind = "expense" | "income" | "transfer";

interface SampleRow {
  key: string;
  icon: typeof Zap;
  kind: Kind;
  category: string | null;
  card?: string;
  date: string;
  amount: number;
}

const ROWS: SampleRow[] = [
  {
    key: "statementPayment",
    icon: CreditCard,
    kind: "expense",
    category: "payment",
    date: "2026-08-20",
    amount: -300000,
  },
  {
    key: "savings",
    icon: PiggyBank,
    kind: "expense",
    category: "savings",
    date: "2026-08-18",
    amount: -120000,
  },
  {
    key: "transfer",
    icon: ArrowLeftRight,
    kind: "transfer",
    category: null,
    date: "2026-08-16",
    amount: -50000,
  },
  {
    key: "electricity",
    icon: Zap,
    kind: "expense",
    category: "utilities",
    date: "2026-08-12",
    amount: -41870,
  },
  {
    key: "interest",
    icon: DollarSign,
    kind: "expense",
    category: "financeCharge",
    date: "2026-08-07",
    amount: -18240,
  },
  {
    key: "notebook",
    icon: Laptop,
    kind: "expense",
    category: "technology",
    card: "••••4417",
    date: "2026-08-02",
    amount: -1290000,
  },
  {
    key: "salary",
    icon: ArrowUp,
    kind: "income",
    category: "income",
    date: "2026-07-25",
    amount: 1420000,
  },
];

const ICON_TONE: Record<Kind, string> = {
  expense: "bg-muted text-muted-foreground",
  income: "bg-success/15 text-success",
  transfer: "bg-info/15 text-info",
};

const BADGE: Record<Kind, "danger" | "success" | "info"> = {
  expense: "danger",
  income: "success",
  transfer: "info",
};

export function MovementsView() {
  const { t } = useTranslation();
  const f = useSampleFormat();

  return (
    <div className="flex flex-col gap-8 py-8">
      <ViewHeader title={t(`${P}.title`)} description={t(`${P}.subtitle`)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-10">
        <div className="flex flex-col gap-4 text-base text-muted-foreground">
          <p>{t(`${P}.p1`)}</p>
          <p>
            <Trans
              i18nKey={`${P}.p2`}
              components={{ b: <strong className="font-medium text-foreground" /> }}
            />
          </p>
          <p>{t(`${P}.p3`)}</p>
          <InfoCard title={t(`${P}.financeCharge.title`)}>{t(`${P}.financeCharge.body`)}</InfoCard>
        </div>

        <div className="flex flex-col gap-4">
          <MonthKpiStrip showCurrency />

          <Card>
            <Table>
              <THead className="bg-muted/50">
                <TR>
                  <TH className="w-8" />
                  <TH>{t(`${P}.table.description`)}</TH>
                  <TH className="w-32">{t(`${P}.table.category`)}</TH>
                  <TH className="w-24">{t(`${P}.table.type`)}</TH>
                  <TH className="w-28 whitespace-nowrap">{t(`${P}.table.card`)}</TH>
                  <TH className="w-28 whitespace-nowrap">{t(`${P}.table.date`)}</TH>
                  <TH numeric className="w-32">
                    {t(`${P}.table.amount`)}
                  </TH>
                </TR>
              </THead>
              <tbody>
                {ROWS.map((row) => (
                  <TR key={row.key} className="hover:bg-muted/40">
                    <TD>
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full",
                          ICON_TONE[row.kind],
                        )}
                      >
                        <row.icon className="h-4 w-4" aria-hidden />
                      </span>
                    </TD>
                    <TD className="w-full max-w-0 font-medium">
                      <div className="truncate">{t(`${P}.rows.${row.key}`)}</div>
                    </TD>
                    <TD>
                      {row.category ? (
                        <span className="text-sm">{t(`${P}.categories.${row.category}`)}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t(`${P}.categories.none`)}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <Badge variant={BADGE[row.kind]}>{t(`${P}.kinds.${row.kind}`)}</Badge>
                    </TD>
                    <TD className="w-28 whitespace-nowrap tabular-nums text-muted-foreground">
                      {row.card ?? <span className="opacity-40">—</span>}
                    </TD>
                    <TD className="w-28 whitespace-nowrap text-muted-foreground">
                      {f.date(row.date)}
                    </TD>
                    <TD
                      numeric
                      className={cn(
                        "w-32 whitespace-nowrap",
                        row.amount < 0 ? "text-destructive" : "text-success",
                      )}
                    >
                      {f.signed(row.amount)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
          <p className="text-xs text-muted-foreground">
            {t(`${P}.footnote`, { transfer: f.money(50000), expenses: f.money(1770110) })}
          </p>
        </div>
      </div>
    </div>
  );
}
