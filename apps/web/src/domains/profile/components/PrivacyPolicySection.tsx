import { ChevronRight, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** Perfil → Datos y privacidad: the way to the privacy policy, read inside the app. */
export function PrivacyPolicySection() {
  const { t } = useTranslation();
  return (
    <Link
      to="/privacy-policy"
      className="flex items-center gap-3 rounded-2xl border bg-card p-5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base font-semibold">{t("legal.privacyPolicy.title")}</span>
        <span className="text-xs text-muted-foreground">
          {t("legal.privacyPolicy.description")}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
