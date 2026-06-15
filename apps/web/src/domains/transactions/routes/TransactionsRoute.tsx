import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { useTransactions } from "../hooks/useTransactions";

export function TransactionsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useTransactions();
  const list = data ?? [];

  return (
    <div>
      <PageHeader title={t("transactions.title")} />
      {isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : list.length === 0 ? (
        <EmptyState title={t("transactions.empty")} />
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between px-6 py-3">
                <span>
                  <span className="font-medium">{t(`transactions.type.${tx.type}`)}</span>
                  {tx.category ? (
                    <span className="text-muted-foreground"> · {tx.category}</span>
                  ) : null}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(tx.amount, { locale: i18n.language, currency: tx.currency })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
