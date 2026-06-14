import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { SidebarNav } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Link } from "@/i18n/navigation";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("brand");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="flex min-h-dvh">
        <aside className="hidden w-56 shrink-0 border-r bg-card md:flex md:flex-col md:py-6 md:pl-4 md:pr-3 lg:w-64 lg:pl-6">
          <Link href="/dashboard" className="mb-6 text-lg font-semibold">
            {t("name")}
          </Link>
          <SidebarNav className="flex-1" />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 space-y-6 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
