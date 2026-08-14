import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

import { anchoredPanelRect, type PanelRect } from "../lib/anchoredPanel";
import { cn } from "../lib/cn";
import { Input } from "./input";

/** Enough room for the icon + a long category on one line ("Pago facturación"). */
const PANEL_MIN_WIDTH = 240;

interface ComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  /**
   * `control` (default) is the bordered form field. `inline` is the label/value
   * row form: no border, no background, right-aligned text with a chevron —
   * only the panel says it is a picker.
   */
  variant?: "control" | "inline";
  /**
   * Leads the control (icon · text · ▾) as an adornment for the CURRENT value —
   * e.g. the category's icon. In `inline` the input shrink-wraps its text so the
   * icon stays next to it instead of stranded at the far side of the row.
   */
  adornment?: ReactNode;
  /** Renders an option in the panel; defaults to its plain text. */
  renderOption?: (option: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
}

/**
 * Text input + a scrollable dropdown of suggestions. Unlike a native <select>,
 * typing a value not in `options` is still accepted (categories are free text
 * server-side) — the panel is just a shortcut to reuse an existing one.
 *
 * The panel is portaled out with `position: fixed` instead of being an
 * `absolute` child of this component, so it isn't clipped/scrolled by a
 * nearby `overflow` ancestor (e.g. a Dialog's own scroll container).
 *
 * When used inside a Dialog, the portal target is the dialog's own content
 * node (found via `closest('[role="dialog"]')`), NOT `document.body`. Radix's
 * Dialog gates its focus trap, dismissable-layer (click outside to close) and
 * body-scroll-lock all on real DOM `.contains()` checks against that node —
 * a panel portaled to `document.body` as a sibling fails every one of those
 * checks (unclickable, wheel-scroll blocked, and clicking an option gets
 * treated as "focus left the dialog" and yanked back, aborting the click).
 * Landing inside that node instead makes it a genuine descendant, so all
 * three checks see it as part of the dialog. Falls back to `document.body`
 * when there's no dialog ancestor (e.g. this component used on a plain page).
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  variant = "control",
  adornment,
  renderOption,
  className,
  "aria-label": ariaLabel,
}: Readonly<ComboboxProps>) {
  const [open, setOpen] = useState(false);
  // Separate from `value`: filters the list while typing, but resets to "" on
  // every open so re-opening after a selection shows all options again instead
  // of just the one that happens to already be in the field.
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<PanelRect | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Chrome keys its form-history suggestions on the field's name/id and ignores
  // `autocomplete="off"` for plain text inputs. Those suggestions draw OVER this
  // component's own panel — same words, no icons, native styling — which reads
  // as "the list lost its icons". A name it has never seen has no history.
  const historylessName = `combobox-${useId()}`;

  function updatePosition() {
    const el = containerRef.current;
    if (!el) return;
    // Placement lives in one place for every portaled panel (see anchoredPanel).
    // The `inline` control shrink-wraps its text, so its own width says nothing
    // about how long the options are — give the panel a floor and hang it from
    // the control's right edge (the value it belongs to is right-aligned too).
    const { rect: next, portalTarget: target } = anchoredPanelRect(
      el,
      variant === "inline" ? { minWidth: PANEL_MIN_WIDTH, align: "end" } : {},
    );
    setPortalTarget(target);
    setRect(next);
  }

  function openPanel() {
    setQuery("");
    setOpen(true);
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
    ? options.filter((o) => o.toLowerCase().includes(normalizedQuery))
    : options;

  function select(option: string) {
    onChange(option);
    setQuery("");
    setOpen(false);
  }

  const inline = variant === "inline";
  const field = (
    <Input
      id={id}
      ref={inputRef}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        setQuery(e.target.value);
        setOpen(true);
      }}
      onFocus={openPanel}
      placeholder={placeholder}
      name={historylessName}
      autoComplete="off"
      spellCheck={false}
      // Password managers otherwise offer to fill this too.
      data-1p-ignore
      data-lpignore="true"
      aria-label={ariaLabel}
      // Shrink-to-fit so the icon before it hugs the text instead of being
      // stranded at the far side of the row. `field-sizing:content` is exact
      // where it exists; `size` (in characters) is the fallback everywhere else,
      // hence the deliberate lack of extra padding.
      size={inline ? Math.max(1, (value || placeholder || "").length) : undefined}
      className={cn(
        inline
          ? // Reads as the row's value until it is focused; the chevron alone
            // signals there is a list behind it.
            "h-8 w-auto min-w-0 max-w-full border-0 bg-transparent px-0 text-right font-medium shadow-none [field-sizing:content] focus-visible:outline-none focus-visible:ring-0"
          : "pr-8",
      )}
    />
  );

  const chevron = (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => {
        // Clicking this button (even with tabIndex={-1}) still moves DOM focus
        // to it. Only re-focus the input when OPENING — doing it unconditionally
        // re-focuses the input while closing too, which fires the input's
        // onFocus handler and immediately re-opens the panel we just closed.
        if (open) {
          setOpen(false);
        } else {
          openPanel();
          inputRef.current?.focus();
        }
      }}
      className={cn(
        "flex shrink-0 text-muted-foreground",
        !inline && "absolute right-2 top-1/2 -translate-y-1/2",
      )}
      aria-label="Toggle options"
    >
      <ChevronDown className="h-4 w-4" aria-hidden />
    </button>
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {inline ? (
        // icon · text · ▾, right-aligned as one group.
        <span className="flex items-center justify-end gap-1.5 text-muted-foreground">
          {adornment ? (
            <span className="pointer-events-none flex shrink-0">{adornment}</span>
          ) : null}
          {field}
          {chevron}
        </span>
      ) : (
        <>
          {field}
          {chevron}
        </>
      )}

      {open && options.length > 0 && rect && portalTarget
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
              className="scrollbar-thin fixed overflow-y-auto rounded-md border bg-card p-1 shadow-md"
            >
              {filtered.length > 0 ? (
                filtered.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => select(o)}
                    className={cn(
                      // `min-w-0` + a non-shrinking leading icon: the label is
                      // what gives when the panel is narrow, never the icon
                      // (a squashed icon reads as a missing one).
                      "flex w-full min-w-0 items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-muted [&>svg]:shrink-0",
                      o === value && "bg-muted font-medium",
                    )}
                  >
                    {renderOption ? renderOption(o) : o}
                  </button>
                ))
              ) : (
                <p className="px-2.5 py-1.5 text-sm text-muted-foreground">{value}</p>
              )}
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
