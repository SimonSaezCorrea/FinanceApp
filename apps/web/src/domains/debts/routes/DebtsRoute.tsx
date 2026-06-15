import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { useDebts } from "../hooks/useDebts";

export function DebtsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useDebts();
  const list = data ?? [];

  return (
    <div>
      <PageHeader title={t("debts.title")} />
      {isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : list.length === 0 ? (
        <EmptyState title={t("debts.empty")} />
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-6 py-3">
                <span>
                  <span className="font-medium">{d.counterparty}</span>
                  <span className="text-muted-foreground"> · {t(`debts.direction.${d.direction}`)}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(d.principal, { locale: i18n.language, currency: d.currency })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
