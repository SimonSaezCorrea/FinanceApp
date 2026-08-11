import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

import { cn } from "../lib/cn";
import { Input } from "./input";

interface ComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

interface Rect {
  /** Set when the panel hangs BELOW the control; `bottom` when it flips above. */
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  /** How much room the chosen side actually has, so a flipped panel that still
   *  doesn't fit scrolls instead of running off the screen. */
  maxHeight: number;
}

/**
 * A `fixed` child is positioned against the VIEWPORT — unless an ancestor
 * establishes a containing block (a transform, filter, or will-change does it).
 * A Dialog's content has one WHILE its open animation runs and none once it
 * settles, so the panel's coordinates have to say which frame of reference they
 * are in instead of assuming one: assuming wrong throws the panel across the
 * screen, which is exactly what a stacked panel made visible.
 */
/** Room a dropdown wants below the control before it gives up and flips up. */
const MIN_PANEL_HEIGHT = 200;
/** Its normal cap; a flipped panel may get less if that's all there is. */
const MAX_PANEL_HEIGHT = 240;

function establishesContainingBlock(el: Element): boolean {
  const style = getComputedStyle(el);
  return (
    style.transform !== "none" ||
    style.filter !== "none" ||
    style.perspective !== "none" ||
    style.willChange.includes("transform") ||
    style.contain.includes("paint")
  );
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
  className,
  "aria-label": ariaLabel,
}: Readonly<ComboboxProps>) {
  const [open, setOpen] = useState(false);
  // Separate from `value`: filters the list while typing, but resets to "" on
  // every open so re-opening after a selection shows all options again instead
  // of just the one that happens to already be in the field.
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function updatePosition() {
    const el = containerRef.current;
    if (!el) return;
    const target = el.closest('[role="dialog"]') ?? document.body;
    const inputRect = el.getBoundingClientRect();
    // `position: fixed` resolves against the viewport UNLESS an ancestor has a
    // transform (the Dialog's positioner does, to center itself) — in that case
    // the transformed ancestor becomes the containing block instead, so offsets
    // must be relative to IT rather than the viewport.
    // Only subtract the dialog's own offset when the dialog is what `fixed`
    // resolves against; otherwise these are plain viewport coordinates.
    const originRect =
      target !== document.body && establishesContainingBlock(target)
        ? target.getBoundingClientRect()
        : null;
    const origin = originRect ?? { top: 0, left: 0 };
    // When `fixed` resolves against the dialog, a bottom-anchored panel measures
    // from the dialog's bottom edge, not the window's.
    const originBottom = originRect ? globalThis.innerHeight - originRect.bottom : null;
    setPortalTarget(target);
    // Flip up when the space below can't hold a usable list and there's more
    // room above — a picker that opens off the bottom of the window is unusable
    // exactly where it matters, at the last field of a long form.
    const gap = 4;
    const spaceBelow = globalThis.innerHeight - inputRect.bottom - gap;
    const spaceAbove = inputRect.top - gap;
    const flipUp = spaceBelow < MIN_PANEL_HEIGHT && spaceAbove > spaceBelow;
    setRect({
      ...(flipUp
        ? // Anchored by its bottom edge, so the panel doesn't need to be measured
          // before it can be placed.
          { bottom: globalThis.innerHeight - inputRect.top + gap - (originBottom ?? 0) }
        : { top: inputRect.bottom + gap - origin.top }),
      left: inputRect.left - origin.left,
      width: inputRect.width,
      maxHeight: Math.min(MAX_PANEL_HEIGHT, flipUp ? spaceAbove : spaceBelow),
    });
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

  return (
    <div ref={containerRef} className={cn("relative", className)}>
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
        autoComplete="off"
        aria-label={ariaLabel}
        className="pr-8"
      />
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
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-label="Toggle options"
      >
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>

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
                      "w-full rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-muted",
                      o === value && "bg-muted font-medium",
                    )}
                  >
                    {o}
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
