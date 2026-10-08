import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { anchoredPanelRect, type PanelRect } from "../lib/anchoredPanel";
import { cn } from "../lib/cn";

const PANEL_WIDTH = 264;
const PANEL_HEIGHT = 250;

interface Props {
  /** Any day of the month shown; only its year and month are read. */
  value: Date;
  /** Always called with the FIRST day of the chosen month. */
  onChange: (month: Date) => void;
  /** Labels for the arrows (defaults: the generic previous/next month). */
  prevLabel?: string;
  nextLabel?: string;
  className?: string;
}

const firstOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * Month navigator: one rounded group — ‹ · the month · › — whose middle opens a
 * year page of months (same calendar language as `DateField`'s month view), with
 * "Este mes" at its foot. Replaces a bare bordered box with two arrows around plain
 * text, which read as a native control rather than one of this app's.
 */
export function MonthPicker({ value, onChange, prevLabel, nextLabel, className }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(value.getFullYear());
  const [rect, setRect] = useState<PanelRect | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const isCurrent =
    value.getFullYear() === today.getFullYear() && value.getMonth() === today.getMonth();

  function updatePosition() {
    const el = containerRef.current;
    if (!el) return;
    const placed = anchoredPanelRect(el, {
      width: PANEL_WIDTH,
      maxHeight: PANEL_HEIGHT,
      minHeight: PANEL_HEIGHT,
      align: "end",
    });
    setPortalTarget(placed.portalTarget);
    setRect(placed.rect);
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("scroll", updatePosition, true);
    globalThis.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("scroll", updatePosition, true);
      globalThis.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const shift = (delta: number) =>
    onChange(new Date(value.getFullYear(), value.getMonth() + delta, 1));
  const pick = (month: Date) => {
    onChange(firstOf(month));
    setOpen(false);
  };

  const label = value.toLocaleDateString(i18n.language, { month: "long", year: "numeric" });
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    // Three letters each: es abbreviates September as "sept", which breaks the grid.
    new Date(2024, i, 1)
      .toLocaleDateString(i18n.language, { month: "short" })
      .replace(".", "")
      .slice(0, 3),
  );
  const arrow =
    "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div
      ref={containerRef}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        className={arrow}
        aria-label={prevLabel ?? t("common.date.previousMonth")}
        onClick={() => shift(-1)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("common.date.chooseMonth")}
        onClick={() => {
          setYear(value.getFullYear());
          setOpen((o) => !o);
        }}
        className={cn(
          "flex h-8 min-w-[9.5rem] items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-muted",
        )}
      >
        <CalendarDays
          className={cn("h-4 w-4", isCurrent ? "text-primary" : "text-muted-foreground")}
          aria-hidden
        />
        <span className="first-letter:uppercase">{label}</span>
      </button>
      <button
        type="button"
        className={arrow}
        aria-label={nextLabel ?? t("common.date.nextMonth")}
        onClick={() => shift(1)}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>

      {open && rect && portalTarget
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={t("common.date.chooseMonth")}
              style={{
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                zIndex: 1370,
              }}
              className="fixed rounded-lg border border-border bg-card p-3 shadow-md"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold tabular-nums">{year}</span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("common.date.previousYear")}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => setYear((y) => y - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t("common.date.nextYear")}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => setYear((y) => y + 1)}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {monthNames.map((name, i) => {
                  const selected = value.getFullYear() === year && value.getMonth() === i;
                  const current = today.getFullYear() === year && today.getMonth() === i;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => pick(new Date(year, i, 1))}
                      aria-current={current ? "date" : undefined}
                      aria-pressed={selected}
                      className={cn(
                        "h-11 rounded-md text-sm capitalize hover:bg-muted",
                        current && !selected && "ring-1 ring-inset ring-border",
                        selected &&
                          "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                      )}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-end border-t border-border pt-2">
                <button
                  type="button"
                  disabled={isCurrent}
                  onClick={() => pick(today)}
                  className="text-sm font-medium text-primary hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
                >
                  {t("common.date.thisMonth")}
                </button>
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
