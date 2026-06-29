import { useTranslation } from "react-i18next";

import type { installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Badge } from "../../../shared/ui/badge";
import { paymentStatus } from "../lib/installmentMetrics";

interface PaymentCalendarProps {
  readonly plan: installments.InstallmentPlan;
}

const statusVariant = {
  paid: "success",
  upcoming: "accent",
  pending: "neutral",
} as const;

export function PaymentCalendar({ plan }: PaymentCalendarProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              {t("installments.calendar.seq")}
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              {t("installments.calendar.date")}
            </th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">
              {t("installments.calendar.amount")}
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              {t("installments.calendar.status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {plan.payments.map((p) => {
            const status = paymentStatus(p, plan.payments);
            return (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{p.sequence}</td>
                <td className="px-4 py-2">
                  {new Date(p.dueDate).toLocaleDateString(i18n.language)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatMoney(p.amount, { locale: i18n.language, currency: plan.currency })}
                </td>
                <td className="px-4 py-2">
                  <Badge variant={statusVariant[status]}>
                    {t(`installments.calendar.${status}`)}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
