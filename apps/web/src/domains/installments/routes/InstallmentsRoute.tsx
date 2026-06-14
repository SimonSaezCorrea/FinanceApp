import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { useInstallments } from "../hooks/useInstallments";

export function InstallmentsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useInstallments();

  if (isLoading) return <p>{t("app.loading")}</p>;
  if (isError) return <p role="alert">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>{t("installments.title")}</h1>
      {list.length === 0 ? (
        <p>{t("installments.empty")}</p>
      ) : (
        <ul>
          {list.map((plan) => {
            const paid = plan.payments.filter((p) => p.paidAt).length;
            return (
              <li key={plan.id}>
                {plan.title} ·{" "}
                {formatMoney(plan.totalPrincipal, { locale: i18n.language, currency: plan.currency })} ·{" "}
                {t("installments.progress", { paid, total: plan.installmentCount })}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
