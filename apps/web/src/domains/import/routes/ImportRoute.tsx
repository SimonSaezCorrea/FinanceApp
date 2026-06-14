import { useTranslation } from "react-i18next";

export function ImportRoute() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("import.title")}</h1>
      <p className="text-muted-foreground">{t("import.info")}</p>
    </div>
  );
}
