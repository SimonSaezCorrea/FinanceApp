"use client";

import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";

import { SidebarNav } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function MobileNav() {
  const tBrand = useTranslations("brand");
  const tCommon = useTranslations("common");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden" aria-label={tCommon("openMenu")}>
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <div className="mt-8 flex flex-col gap-6">
          <div className="text-lg font-semibold">{tBrand("name")}</div>
          <SidebarNav />
        </div>
      </SheetContent>
    </Sheet>
  );
}
