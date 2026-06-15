import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { type ThemeMode, useTheme } from "../../theme/useTheme";
import { cn } from "../lib/cn";

const OPTIONS: { mode: ThemeMode; icon: typeof Sun; key: string }[] = [
  { mode: "light", icon: Sun, key: "theme.light" },
  { mode: "dark", icon: Moon, key: "theme.dark" },
  { mode: "system", icon: Monitor, key: "theme.system" },
];

/** Segmented dark·light·system switch. */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const { t } = useTranslation();

  return (
    <div className="inline-flex rounded-md border bg-background p-0.5" role="group" aria-label={t("theme.label")}>
      {OPTIONS.map(({ mode: m, icon: Icon, key }) => (
        <button
          key={m}
          type="button"
          aria-label={t(key)}
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          className={cn(
            "inline-flex h-7 w-8 items-center justify-center rounded-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
