import { getTranslations } from "next-intl/server";

export default async function ImportPage() {
  const t = await getTranslations("pages.import");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
    </div>
  );
}
