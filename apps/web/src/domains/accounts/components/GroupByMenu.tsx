import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { GROUP_BY_VALUES, type GroupBy } from "../lib/grouping";

interface Props {
  value: GroupBy;
  onChange: (value: GroupBy) => void;
}

/** "Agrupar: Moneda ▾" — a small dropdown for how the account list is sectioned. */
export function GroupByMenu({ value, onChange }: Readonly<Props>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 items-center gap-2 rounded-lg border px-3 text-xs text-muted-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open ? "border-primary" : "border-border2 hover:border-primary/50",
        )}
      >
        {t("accounts.groupBy.label")}{" "}
        <span className="font-medium text-foreground">{t(`accounts.groupBy.${value}`)}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open ? (
        <>
          {/* Click-away layer (the menu is small and inline — no portal needed). */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("app.close")}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            className="absolute right-0 top-10 z-50 w-48 rounded-[10px] border border-border2 bg-surface2 p-1.5 shadow-lg"
          >
            {GROUP_BY_VALUES.map((option) => {
              const active = option === value;
              return (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors",
                      active
                        ? "bg-primary/10 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t(`accounts.groupBy.${option}`)}
                    {active ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
