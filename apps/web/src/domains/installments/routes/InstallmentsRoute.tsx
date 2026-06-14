import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { useInstallments } from "../hooks/useInstallments";

export function InstallmentsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useInstallments();

  if (isLoading) return <p className="text-muted-foreground">{t("app.loading")}</p>;
  if (isError) return <p role="alert" className="text-destructive">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("installments.title")}</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground">{t("installments.empty")}</p>
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((plan) => {
              const paid = plan.payments.filter((p) => p.paidAt).length;
              return (
                <li key={plan.id} className="flex items-center justify-between px-6 py-3">
                  <span className="font-medium">{plan.title}</span>
                  <span className="flex items-center gap-3 text-muted-foreground">
                    <span className="tabular-nums">
                      {formatMoney(plan.totalPrincipal, { locale: i18n.language, currency: plan.currency })}
                    </span>
                    <span className="text-xs">
                      {t("installments.progress", { paid, total: plan.installmentCount })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
