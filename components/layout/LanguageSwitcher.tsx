"use client";

import { useLocale, useTranslations } from "next-intl";

import { locales, type Locale } from "@/lib/i18n/routing";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("languageSwitcher");
  const pathname = usePathname();
  const current = useLocale() as Locale;

  const localeLabels: Record<Locale, string> = {
    en: t("english"),
    es: t("spanish"),
  };

  return (
    <div
      className={cn("flex items-center gap-1 rounded-md border bg-background/80 p-0.5 text-xs shadow-sm", className)}
      role="group"
      aria-label={t("aria")}
    >
      {locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          className={cn(
            "rounded px-2 py-1 font-medium transition-colors",
            current === locale
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
          prefetch={false}
        >
          {localeLabels[locale]}
        </Link>
      ))}
    </div>
  );
}
