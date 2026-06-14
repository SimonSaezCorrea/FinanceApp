import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/LoginForm";
import { Link } from "@/i18n/navigation";

export default async function LoginPage() {
  const t = await getTranslations("auth.login");
  const googleConfigured =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <LoginForm googleConfigured={googleConfigured} />
      <p className="text-center text-sm text-muted-foreground">
        {t("needAccount")}{" "}
        <Link href="/register" className="text-primary underline-offset-4 hover:underline">
          {t("registerLink")}
        </Link>
      </p>
    </div>
  );
}
