import { getTranslations } from "next-intl/server";

export default async function InstallmentsPage() {
  const t = await getTranslations("pages.installments");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
    </div>
  );
}
