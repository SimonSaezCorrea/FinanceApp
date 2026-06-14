import { useTranslation } from "react-i18next";

import { useInvestments } from "../hooks/useInvestments";

export function InvestmentsRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useInvestments();

  if (isLoading) return <p>{t("app.loading")}</p>;
  if (isError) return <p role="alert">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>{t("investments.title")}</h1>
      {list.length === 0 ? (
        <p>{t("investments.empty")}</p>
      ) : (
        <ul>
          {list.map((inv) => (
            <li key={inv.id}>
              {inv.label} — {t(`investments.kind.${inv.kind}`)}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
