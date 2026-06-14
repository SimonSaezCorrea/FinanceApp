import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export default async function RegisterPage() {
  const t = await getTranslations("auth.register");

  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      <Link
        href="/login"
        className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("backToSignIn")}
      </Link>
    </div>
  );
}
