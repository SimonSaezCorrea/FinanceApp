import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { useTransactions } from "../hooks/useTransactions";

export function TransactionsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useTransactions();

  if (isLoading) return <p>{t("app.loading")}</p>;
  if (isError) return <p role="alert">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>{t("transactions.title")}</h1>
      {list.length === 0 ? (
        <p>{t("transactions.empty")}</p>
      ) : (
        <ul>
          {list.map((tx) => (
            <li key={tx.id}>
              {t(`transactions.type.${tx.type}`)} ·{" "}
              {formatMoney(tx.amount, { locale: i18n.language, currency: tx.currency })}
              {tx.category ? ` · ${tx.category}` : ""}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
