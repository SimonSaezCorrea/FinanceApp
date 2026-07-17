import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";

interface DateRangeButtonProps {
  from?: string;
  to?: string;
  onChange: (range: { from?: string; to?: string }) => void;
}

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromIso(iso?: string): string | undefined {
  return iso ? iso.slice(0, 10) : undefined;
}

function monthStartFromIsoDate(isoDate: string): Date {
  const parts = isoDate.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  return new Date(Date.UTC(y, m - 1, 1));
}

export function formatDateRangeLabel(
  from: string | undefined,
  to: string | undefined,
  locale: string,
): string {
  if (!from && !to) return "";
  const dayFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", timeZone: "UTC" });
  const monthFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
  const yearFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { year: "numeric", timeZone: "UTC" });

  if (from && to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7);
    if (sameMonth) return `${dayFmt(from)}–${dayFmt(to)} ${monthFmt(to)}`;
    if (sameYear) return `${dayFmt(from)} ${monthFmt(from)} – ${dayFmt(to)} ${monthFmt(to)} ${yearFmt(to)}`;
    return `${dayFmt(from)} ${monthFmt(from)} ${yearFmt(from)} – ${dayFmt(to)} ${monthFmt(to)} ${yearFmt(to)}`;
  }
  if (from) return `${dayFmt(from)} ${monthFmt(from)} ${yearFmt(from)} –`;
  return `– ${dayFmt(to!)} ${monthFmt(to!)} ${yearFmt(to!)}`;
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(Date.UTC(year, month, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, i) => new Date(Date.UTC(year, month, 1 - mondayOffset + i)),
  );
}

function weekdayLabels(locale: string): string[] {
  // 2026-01-05 is a Monday; walking 7 days gives a Mon-Sun reference week.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 5 + i));
    return d.toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }).slice(0, 2);
  });
}

export function DateRangeButton({ from, to, onChange }: Readonly<DateRangeButtonProps>) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const committedFrom = fromIso(from);
  const committedTo = fromIso(to);

  const [draftStart, setDraftStart] = useState<string | undefined>(committedFrom);
  const [draftEnd, setDraftEnd] = useState<string | undefined>(committedTo);
  const [hoverDate, setHoverDate] = useState<string | undefined>(undefined);
  const [viewDate, setViewDate] = useState<Date>(() =>
    monthStartFromIsoDate(committedFrom ?? toIsoDate(new Date())),
  );

  useEffect(() => {
    if (!open) return;
    setDraftStart(committedFrom);
    setDraftEnd(committedTo);
    setHoverDate(undefined);
    setViewDate(monthStartFromIsoDate(committedFrom ?? toIsoDate(new Date())));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only resync when the popover opens
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const label = formatDateRangeLabel(from, to, i18n.language) || t("transactions.filters.dateRange");
  const weekdays = useMemo(() => weekdayLabels(i18n.language), [i18n.language]);
  const grid = useMemo(
    () => buildMonthGrid(viewDate.getUTCFullYear(), viewDate.getUTCMonth()),
    [viewDate],
  );
  const monthLabel = viewDate.toLocaleDateString(i18n.language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const today = toIsoDate(new Date());

  function commit(startIso: string, endIso: string) {
    onChange({ from: `${startIso}T00:00:00.000Z`, to: `${endIso}T23:59:59.999Z` });
    setOpen(false);
  }

  function handleDayClick(iso: string) {
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(iso);
      setDraftEnd(undefined);
      return;
    }
    if (iso < draftStart) {
      setDraftStart(iso);
      return;
    }
    setDraftEnd(iso);
    commit(draftStart, iso);
  }

  function handleClear() {
    setDraftStart(undefined);
    setDraftEnd(undefined);
    onChange({ from: undefined, to: undefined });
    setOpen(false);
  }

  function handleToday() {
    commit(today, today);
  }

  const rangeStart = draftStart;
  const rangeEnd = draftEnd ?? (draftStart && hoverDate ? hoverDate : undefined);
  let normStart = rangeStart;
  let normEnd = rangeStart;
  if (rangeStart && rangeEnd) {
    normStart = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    normEnd = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm hover:bg-muted"
      >
        <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
        {label}
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border bg-card p-3 shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setViewDate(
                  (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)),
                )
              }
              className="rounded-md p-1 hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="text-sm font-medium">{monthLabel}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setViewDate(
                  (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)),
                )
              }
              className="rounded-md p-1 hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {weekdays.map((wd) => (
              <span key={wd} className="text-[11px] uppercase text-muted-foreground">
                {wd}
              </span>
            ))}
            {grid.map((date) => {
              const iso = toIsoDate(date);
              const inMonth = date.getUTCMonth() === viewDate.getUTCMonth();
              const inRange = Boolean(normStart && normEnd && iso >= normStart && iso <= normEnd);
              const isEndpoint = iso === normStart || iso === normEnd;
              const isToday = iso === today;

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => handleDayClick(iso)}
                  onMouseEnter={() => setHoverDate(iso)}
                  disabled={!inMonth}
                  className={cn(
                    "h-8 w-8 rounded-md text-sm transition-colors",
                    !inMonth && "invisible",
                    inMonth && !inRange && "text-foreground hover:bg-muted",
                    inRange && !isEndpoint && "bg-primary/15 text-foreground",
                    isEndpoint && "bg-primary text-primary-foreground",
                    isToday && !isEndpoint && "ring-1 ring-inset ring-primary/50",
                  )}
                >
                  {date.getUTCDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {t("transactions.filters.clearDates")}
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {t("transactions.filters.today")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
