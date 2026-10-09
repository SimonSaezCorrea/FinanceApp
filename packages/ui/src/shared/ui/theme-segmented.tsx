import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { type ThemeMode, useTheme } from "../../theme/useTheme";
import { cn } from "../lib/cn";

const OPTIONS: { mode: ThemeMode; icon: typeof Sun; key: string }[] = [
  { mode: "light", icon: Sun, key: "theme.light" },
  { mode: "dark", icon: Moon, key: "theme.dark" },
  { mode: "system", icon: Monitor, key: "theme.system" },
];

/**
 * Light · Dark · System as three named, full-width 44px segments — the theme choice wherever there
 * is room for words (the profile, the landing's phone menu). `ThemeToggle` stays the compact icon
 * strip for the sidebar. Writes through `useTheme().setMode`, the same path as that toggle, so
 * `ThemeSync` persists it and both always agree.
 */
export function ThemeSegmented({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();
  const { mode, setMode } = useTheme();
  return (
    <div
      role="group"
      aria-label={t("theme.label")}
      className={cn("grid grid-cols-3 gap-1 rounded-xl border bg-background p-1", className)}
    >
      {OPTIONS.map(({ mode: option, icon: Icon, key }) => {
        const active = mode === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => setMode(option)}
            className={cn(
              "flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary/15 text-foreground" : "text-muted-foreground active:bg-muted/60",
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} aria-hidden />
            <span className="truncate">{t(key)}</span>
          </button>
        );
      })}
    </div>
  );
}
