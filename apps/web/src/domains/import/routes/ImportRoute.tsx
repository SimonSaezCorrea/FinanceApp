import { useTranslation } from "react-i18next";

export function ImportRoute() {
  const { t } = useTranslation();

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>{t("import.title")}</h1>
      <p>{t("import.info")}</p>
    </main>
  );
}
