import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { anchoredPanelRect, type PanelRect } from "../lib/anchoredPanel";
import { cn } from "../lib/cn";

const PANEL_WIDTH = 280;
const PANEL_HEIGHT = 340;

/** `yyyy-mm-dd` — the same shape a native date input exchanges. */
export type DateValue = string;

function parse(value: DateValue): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  // Built as a LOCAL date on purpose: `new Date("2026-08-11")` is parsed as UTC
  // and lands on the previous day for anyone west of Greenwich (i.e. here).
  return new Date(y!, m! - 1, d!);
}

function toValue(date: Date): DateValue {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Years shown per page of the year view — a 3×4 grid, same shape as the months. */
const YEARS_PER_PAGE = 12;

/** First year of the 12-year page containing `year`, aligned to multiples of 12
 * so paging back and forth always lands on the same pages. */
function yearPageStart(year: number): number {
  return year - (((year % YEARS_PER_PAGE) + YEARS_PER_PAGE) % YEARS_PER_PAGE);
}

/**
 * What the open calendar is showing. The header title steps UP a level
 * (days → months → years); picking a cell steps back DOWN, so jumping to a date
 * years away is three clicks instead of dozens of month arrows.
 */
type View = "days" | "months" | "years";

/** The 42 cells of a month grid, weeks starting on Monday. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // getDay() is Sunday-first; shift so Monday is 0, as every Spanish-language
  // calendar (and the design) lays it out.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

interface Props {
  id?: string;
  value: DateValue;
  onChange: (value: DateValue) => void;
  /** Rendered as a borderless label/value row control instead of a form field. */
  variant?: "control" | "inline";
  disabled?: boolean;
  className?: string;
  /** Allows clearing the date (adds a "Borrar" action). */
  clearable?: boolean;
  /** Trailing icon on the trigger. Defaults to a dropdown chevron — pass e.g.
   * `CalendarClock` where the control isn't meant to read as a picker/dropdown. */
  icon?: LucideIcon;
  "aria-label"?: string;
}

/**
 * Date picker with the app's own calendar instead of the browser's.
 *
 * A native `<input type="date">` renders the OS/browser popup: it ignores every
 * token in this app (it came up white in a dark panel), can't be laid out
 * Monday-first, and looks different in each browser. Only the calendar is
 * re-implemented — the value it exchanges stays the native `yyyy-mm-dd` string,
 * so callers and form state are unchanged.
 */
export function DateField({
  id,
  value,
  onChange,
  variant = "control",
  disabled = false,
  className,
  clearable = false,
  icon: Icon = ChevronDown,
  "aria-label": ariaLabel,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<PanelRect | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const selected = parse(value);
  const [month, setMonth] = useState<Date>(
    () => selected ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [view, setView] = useState<View>("days");
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  function updatePosition() {
    const el = containerRef.current;
    if (!el) return;
    const { rect: next, portalTarget: target } = anchoredPanelRect(el, {
      width: PANEL_WIDTH,
      maxHeight: PANEL_HEIGHT,
      minHeight: PANEL_HEIGHT,
      // The trigger sits at the right edge of its row, so the panel hangs from
      // that edge rather than starting there and running off the panel.
      align: "end",
    });
    setPortalTarget(target);
    setRect(next);
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    // capture:true so scrolling inside the Dialog's own container is caught too.
    globalThis.addEventListener("scroll", updatePosition, true);
    globalThis.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("scroll", updatePosition, true);
      globalThis.removeEventListener("resize", updatePosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updatePosition is stable enough here
  }, [open]);

  function openPanel() {
    if (disabled) return;
    setMonth(selected ?? new Date(today.getFullYear(), today.getMonth(), 1));
    setView("days");
    setOpen(true);
  }

  function pick(date: Date) {
    onChange(toValue(date));
    setOpen(false);
  }

  const label = selected
    ? selected.toLocaleDateString(i18n.language, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : t("common.date.choose");

  const year = month.getFullYear();
  const pageStart = yearPageStart(year);

  // Per view: what the title says, what it steps up to, and how far the arrows move.
  const header = {
    days: {
      title: month.toLocaleDateString(i18n.language, { month: "long", year: "numeric" }),
      up: "months" as View | null,
      upLabel: t("common.date.chooseMonth"),
      prevLabel: t("common.date.previousMonth"),
      nextLabel: t("common.date.nextMonth"),
      step: (dir: number) => setMonth(new Date(year, month.getMonth() + dir, 1)),
    },
    months: {
      title: String(year),
      up: "years" as View | null,
      upLabel: t("common.date.chooseYear"),
      prevLabel: t("common.date.previousYear"),
      nextLabel: t("common.date.nextYear"),
      step: (dir: number) => setMonth(new Date(year + dir, month.getMonth(), 1)),
    },
    years: {
      title: `${pageStart} – ${pageStart + YEARS_PER_PAGE - 1}`,
      up: null as View | null,
      upLabel: "",
      prevLabel: t("common.date.previousYears"),
      nextLabel: t("common.date.nextYears"),
      step: (dir: number) => setMonth(new Date(year + dir * YEARS_PER_PAGE, month.getMonth(), 1)),
    },
  }[view];

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    // Three letters each: es abbreviates September as "sept", which breaks the grid.
    new Date(2024, i, 1)
      .toLocaleDateString(i18n.language, { month: "short" })
      .replace(".", "")
      .slice(0, 3),
  );

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    // 2024-01-01 was a Monday, so this walks Monday→Sunday in any locale.
    new Date(2024, 0, 1 + i).toLocaleDateString(i18n.language, { weekday: "narrow" }),
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={ariaLabel}
        className={cn(
          "flex items-center gap-1.5 text-sm",
          variant === "control"
            ? "h-10 w-full justify-between rounded-md border border-input bg-background px-3 text-left focus-visible:ring-2 focus-visible:ring-ring"
            : "h-8 justify-end font-medium",
          "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {selected && sameDay(selected, today) ? (
          <span className="text-muted-foreground">{t("common.date.today")} ·</span>
        ) : null}
        <span className="tabular-nums">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && rect && portalTarget
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                // Above a panel stacked on another panel (see `Drawer`).
                zIndex: 1370,
              }}
              className="fixed rounded-lg border border-border bg-card p-3 shadow-md"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                {header.up ? (
                  // The title IS the way up a level — a real button with a chevron,
                  // not a label, so it reads as something to press.
                  <button
                    type="button"
                    aria-label={header.upLabel}
                    className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-semibold capitalize hover:bg-muted"
                    onClick={() => setView(header.up!)}
                  >
                    {header.title}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  </button>
                ) : (
                  <span className="text-sm font-semibold tabular-nums">{header.title}</span>
                )}
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={header.prevLabel}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => header.step(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={header.nextLabel}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => header.step(1)}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </span>
              </div>

              {view === "months" ? (
                <div className="grid grid-cols-3 gap-1">
                  {monthNames.map((name, i) => {
                    const isSelected =
                      !!selected && selected.getFullYear() === year && selected.getMonth() === i;
                    const isCurrent = today.getFullYear() === year && today.getMonth() === i;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setMonth(new Date(year, i, 1));
                          setView("days");
                        }}
                        className={cn(
                          "capitalize",
                          cn(
                            "h-[52px] rounded-md text-sm hover:bg-muted",
                            isCurrent && !isSelected && "ring-1 ring-inset ring-border",
                            isSelected &&
                              "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                          ),
                        )}
                        aria-current={isCurrent ? "date" : undefined}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {view === "years" ? (
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: YEARS_PER_PAGE }, (_, i) => pageStart + i).map((y) => {
                    const isSelected = selected?.getFullYear() === y;
                    const isCurrent = today.getFullYear() === y;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setMonth(new Date(y, month.getMonth(), 1));
                          setView("months");
                        }}
                        className={cn(
                          "tabular-nums",
                          cn(
                            "h-[52px] rounded-md text-sm hover:bg-muted",
                            isCurrent && !isSelected && "ring-1 ring-inset ring-border",
                            isSelected &&
                              "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                          ),
                        )}
                        aria-current={isCurrent ? "date" : undefined}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {view === "days" ? (
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {weekdays.map((w, i) => (
                    <span
                      key={`${w}-${i}`}
                      className="pb-1 text-[11px] font-medium uppercase text-muted-foreground"
                    >
                      {w}
                    </span>
                  ))}
                  {monthGrid(month).map((day) => {
                    const outside = day.getMonth() !== month.getMonth();
                    const isSelected = selected ? sameDay(day, selected) : false;
                    const isToday = sameDay(day, today);
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => pick(day)}
                        className={cn(
                          "h-8 rounded-md text-sm tabular-nums hover:bg-muted",
                          outside && "text-muted-foreground/50",
                          isToday && !isSelected && "ring-1 ring-inset ring-border",
                          isSelected &&
                            "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                        )}
                        aria-current={isToday ? "date" : undefined}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                {clearable ? (
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    {t("common.date.clear")}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="text-sm font-medium text-brand hover:underline"
                  onClick={() => pick(new Date())}
                >
                  {t("common.date.today")}
                </button>
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
