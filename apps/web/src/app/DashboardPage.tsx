import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>{t("brand.name")}</h1>
      <p>{t("app.welcome")}</p>
    </main>
  );
}
