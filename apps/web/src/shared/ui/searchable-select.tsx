import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "../lib/cn";
import { Input } from "./input";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
}

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  /** Overrides what the closed control shows for the current `value` (defaults
   * to the matching option's `label`) — e.g. a currency picker whose dropdown
   * list reads "Dólar estadounidense (USD)" but the closed control just shows
   * "USD". Ignored when nothing is selected. */
  displayValue?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * A `<select>`-like control for long option lists (banks, currencies): a
 * native `<select>`'s popup can't be restyled or height-capped cross-browser,
 * which makes a 20+ item list (banks) or a 168-item one (currencies) unwieldy
 * — this instead opens a custom, fixed-height (`max-h-60`) scrollable panel
 * with its own styled scrollbar and a search box to filter by label.
 *
 * Portaling/positioning/dismissal mirrors Combobox: the panel targets the
 * nearest `[role="dialog"]` ancestor (not `document.body`) so Radix's focus
 * trap / dismissable-layer / body-scroll-lock — all gated on real DOM
 * containment — see it as part of the dialog instead of an outside click.
 */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  noResultsLabel,
  displayValue,
  disabled,
  className,
  "aria-label": ariaLabel,
}: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function updatePosition() {
    const el = containerRef.current;
    if (!el) return;
    const target = el.closest('[role="dialog"]') ?? document.body;
    const controlRect = el.getBoundingClientRect();
    const origin = target === document.body ? { top: 0, left: 0 } : target.getBoundingClientRect();
    setPortalTarget(target);
    setRect({
      top: controlRect.bottom + 4 - origin.top,
      left: controlRect.left - origin.left,
      width: controlRect.width,
    });
  }

  function openPanel() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    searchRef.current?.focus();
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
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updatePosition is stable enough for this effect's purpose
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((o) => o.label.toLowerCase().includes(normalizedQuery))
    : options;
  const matchedLabel = options.find((o) => o.value === value)?.label ?? "";
  const selectedLabel = value ? (displayValue ?? matchedLabel) : "";

  function select(option: SearchableSelectOption) {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={ariaLabel}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
          {selectedLabel || placeholder || ""}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && rect && portalTarget
        ? createPortal(
            <div
              ref={panelRef}
              style={{ top: rect.top, left: rect.left, width: rect.width }}
              className="fixed z-[1350] flex flex-col overflow-hidden rounded-md border bg-card shadow-md"
            >
              <div className="border-b p-1">
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  autoComplete="off"
                  className="h-8"
                />
              </div>
              <div className="scrollbar-thin max-h-60 overflow-y-auto p-1">
                {filtered.length > 0 ? (
                  filtered.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => select(o)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-muted",
                        o.value === value && "bg-muted font-medium",
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.value === value ? (
                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      ) : null}
                    </button>
                  ))
                ) : (
                  <p className="px-2.5 py-1.5 text-sm text-muted-foreground">{noResultsLabel}</p>
                )}
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
