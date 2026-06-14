import { getTranslations } from "next-intl/server";

import { MobileNav } from "@/components/layout/MobileNav";
import { SettingsSheet } from "@/components/layout/SettingsSheet";
import { UserMenu } from "@/components/layout/UserMenu";
import { Link } from "@/i18n/navigation";

export async function Topbar() {
  const tBrand = await getTranslations("brand");
  const tTop = await getTranslations("topbar");

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        <Link href="/dashboard" className="text-lg font-semibold md:hidden">
          {tBrand("name")}
        </Link>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="hidden text-sm text-muted-foreground sm:block">{tTop("tagline")}</div>
        <SettingsSheet triggerClassName="shrink-0" />
        <UserMenu />
      </div>
    </header>
  );
}
