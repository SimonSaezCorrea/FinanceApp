"use client";

import { useLocale, useTranslations } from "next-intl";
import { signOut, useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function UserMenu() {
  const t = useTranslations("auth.userMenu");
  const locale = useLocale();
  const { data } = useSession();
  if (!data?.user) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden max-w-[160px] truncate sm:inline">{data.user.email}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
      >
        {t("signOut")}
      </Button>
    </div>
  );
}
