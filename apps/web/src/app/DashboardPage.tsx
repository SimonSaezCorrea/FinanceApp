import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("brand.name")}</h1>
      <p className="mt-1 text-muted-foreground">{t("app.welcome")}</p>
    </div>
  );
}
