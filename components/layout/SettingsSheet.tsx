"use client";

import { Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type ThemeChoice = "light" | "dark" | "system";

export function SettingsSheet({ triggerClassName }: { triggerClassName?: string }) {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeTheme = mounted ? ((theme ?? "light") as ThemeChoice) : undefined;

  const setChoice = (choice: ThemeChoice) => setTheme(choice);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={triggerClassName} aria-label={t("openAria")}>
          <Settings className="h-5 w-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-1 flex-col gap-8 overflow-y-auto">
          <section className="space-y-3">
            <h3 className="text-sm font-medium leading-none">{t("appearance")}</h3>
            {!mounted ? (
              <div className="h-12 w-full animate-pulse rounded-md bg-muted" aria-hidden />
            ) : (
              <div
                className="flex flex-wrap gap-2 rounded-md border bg-background p-1 shadow-sm"
                role="group"
                aria-label={t("appearance")}
              >
                {(
                  [
                    ["light", t("themeLight")],
                    ["dark", t("themeDark")],
                    ["system", t("themeSystem")],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={activeTheme === value ? "default" : "ghost"}
                    size="sm"
                    className="flex-1 min-w-[5.5rem]"
                    onClick={() => setChoice(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium leading-none">{t("language")}</h3>
            <LanguageSwitcher className="w-full shrink-0 justify-center sm:justify-start" />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
