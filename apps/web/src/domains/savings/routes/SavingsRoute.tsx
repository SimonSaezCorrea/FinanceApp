import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { useSavingsGoals } from "../hooks/useSavings";

export function SavingsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useSavingsGoals();

  if (isLoading) return <p>{t("app.loading")}</p>;
  if (isError) return <p role="alert">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>{t("savings.title")}</h1>
      {list.length === 0 ? (
        <p>{t("savings.empty")}</p>
      ) : (
        <ul>
          {list.map((goal) => (
            <li key={goal.id}>
              {goal.title} — {formatMoney(goal.targetAmount, { locale: i18n.language, currency: goal.currency })}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
