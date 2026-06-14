import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { useTransactions } from "../hooks/useTransactions";

export function TransactionsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useTransactions();

  if (isLoading) return <p className="text-muted-foreground">{t("app.loading")}</p>;
  if (isError) return <p role="alert" className="text-destructive">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("transactions.title")}</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground">{t("transactions.empty")}</p>
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between px-6 py-3">
                <span>
                  <span className="font-medium">{t(`transactions.type.${tx.type}`)}</span>
                  {tx.category ? <span className="text-muted-foreground"> · {tx.category}</span> : null}
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
