import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { useAccounts } from "../hooks/useAccounts";

export function AccountsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useAccounts();

  if (isLoading) return <p>{t("app.loading")}</p>;
  if (isError) return <p role="alert">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>{t("accounts.title")}</h1>
      {list.length === 0 ? (
        <p>{t("accounts.empty")}</p>
      ) : (
        <ul>
          {list.map((acc) => (
            <li key={acc.id}>
              {acc.name} — {formatMoney(acc.currentBalance, { locale: i18n.language, currency: acc.currency })}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
