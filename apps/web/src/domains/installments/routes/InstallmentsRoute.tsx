import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { useInstallments } from "../hooks/useInstallments";

export function InstallmentsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useInstallments();
  const list = data ?? [];

  return (
    <div>
      <PageHeader title={t("installments.title")} />
      {isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : list.length === 0 ? (
        <EmptyState title={t("installments.empty")} />
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
                      {formatMoney(plan.totalPrincipal, {
                        locale: i18n.language,
                        currency: plan.currency,
                      })}
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
