import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { useDebts } from "../hooks/useDebts";

export function DebtsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useDebts();

  if (isLoading) return <p>{t("app.loading")}</p>;
  if (isError) return <p role="alert">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>{t("debts.title")}</h1>
      {list.length === 0 ? (
        <p>{t("debts.empty")}</p>
      ) : (
        <ul>
          {list.map((d) => (
            <li key={d.id}>
              {d.counterparty} — {formatMoney(d.principal, { locale: i18n.language, currency: d.currency })} ({t(`debts.direction.${d.direction}`)})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
