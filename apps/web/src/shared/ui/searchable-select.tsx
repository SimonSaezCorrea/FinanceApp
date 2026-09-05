import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { anchoredPanelRect, type PanelRect } from "../lib/anchoredPanel";
import { cn } from "../lib/cn";
import { Input } from "./input";

/** Floor for the panel of an `inline` control, which shrink-wraps its own text. */
const PANEL_MIN_WIDTH = 240;

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Extra terms the search box also matches, beyond the visible label — e.g. an
   * institution's legal name and its other commercial brands, which the user may
   * well type ("Copec Pay", "Banefe") without them being the label shown. */
  keywords?: string[];
  /** A muted second line under `label` — e.g. an account's "Corriente · Banco de
   * Chile · 001-2345678-90". Shown both in the dropdown row and, for the
   * SELECTED option, on the closed control — the same two-line shape a debt's
   * "Cuenta asociada" detail row already uses, so a picker and its own read-only
   * display never disagree on how much identifies an account. */
  description?: string;
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
  /**
   * `control` (default) is the bordered form field. `inline` is the label/value
   * row form: no border, no background, right-aligned — the value reads as text
   * with a chevron, and only the panel says it is a picker.
   */
  variant?: "control" | "inline";
  "aria-label"?: string;
}

/**
 * A `fixed` child is positioned against the VIEWPORT — unless an ancestor
 * establishes a containing block (a transform, filter, or will-change does it).
 * A Dialog's content has one WHILE its open animation runs and none once it
 * settles, so the panel's coordinates have to say which frame of reference they
 * are in instead of assuming one: assuming wrong throws the panel across the
 * screen, which is exactly what a stacked panel made visible.
 */
/**
 * A `<select>`-like control for long option lists (banks, currencies): a
 * native `<select>`'s popup can't be restyled or height-capped cross-browser,
 * which makes a 20+ item list (banks) or a 168-item one (currencies) unwieldy
 * — this instead opens a custom scrollable panel (capped by the room it has)
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
  variant = "control",
  "aria-label": ariaLabel,
}: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<PanelRect | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // See Combobox: a never-seen field name keeps Chrome's form history from
  // drawing its own suggestions on top of this panel.
  const historylessName = `search-${useId()}`;
  const panelRef = useRef<HTMLDivElement>(null);

  function updatePosition() {
    const el = containerRef.current;
    if (!el) return;
    // Placement lives in one place for every portaled panel (see anchoredPanel).
    // The `inline` control shrink-wraps its text — and with nothing selected it is
    // barely a chevron wide — so its own width says nothing about how long the
    // options are. Same floor and right-alignment Combobox already uses; without
    // them the panel rendered as a few-pixel sliver beside the row.
    const { rect: next, portalTarget: target } = anchoredPanelRect(
      el,
      variant === "inline" ? { minWidth: PANEL_MIN_WIDTH, align: "end" } : {},
    );
    setPortalTarget(target);
    setRect(next);
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
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((o) =>
        [o.label, ...(o.keywords ?? [])].some((term) =>
          term.toLowerCase().includes(normalizedQuery),
        ),
      )
    : options;
  const matchedOption = options.find((o) => o.value === value);
  const selectedLabel = value ? (displayValue ?? matchedOption?.label ?? "") : "";
  // `displayValue` overrides the LABEL for a narrower closed-control reading
  // (e.g. a currency's bare code) — it says nothing about the description, so
  // the two-line shape still applies whenever the matched option carries one.
  const selectedDescription = value ? matchedOption?.description : undefined;

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
          "flex w-full items-center gap-2 text-sm",
          variant === "control"
            ? "min-h-10 justify-between rounded-md border border-input bg-background px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring"
            : "min-h-8 justify-end text-right font-medium",
          "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {selectedDescription ? (
          <span className={cn("flex min-w-0 flex-col", variant === "inline" && "items-end")}>
            <span className="truncate">{selectedLabel}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {selectedDescription}
            </span>
          </span>
        ) : (
          <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel || placeholder || ""}
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && rect && portalTarget
        ? createPortal(
            <div
              ref={panelRef}
              // Above a panel stacked on another panel (see `Drawer`), which the
              // old Tailwind z-class sat just below.
              style={{
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                maxHeight: rect.maxHeight,
                zIndex: 1370,
              }}
              className="fixed flex flex-col overflow-hidden rounded-md border bg-card shadow-md"
            >
              <div className="border-b p-1">
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  name={historylessName}
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  className="h-8"
                />
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1">
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
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{o.label}</span>
                        {o.description ? (
                          <span className="truncate text-xs font-normal text-muted-foreground">
                            {o.description}
                          </span>
                        ) : null}
                      </span>
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
