import { Pencil, Trash2 } from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";

const ACTION_WIDTH = 144;
// Snap open only past the halfway point of the reveal — a small nudge settles
// back closed instead of jumping fully open, so the gesture reads as a real
// drag with travel rather than an all-or-nothing toggle.
const OPEN_RATIO = 0.5;
const AXIS_LOCK_PX = 8;
const SETTLE_TRANSITION = "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)";

type GestureHandlers = {
  move: (e: globalThis.PointerEvent) => void;
  up: () => void;
  cancel: () => void;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onTap?: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Swipe-to-reveal row (tablet + mobile): dragging left exposes the same
 * Editar/Eliminar pair the row's own tap-to-open sheet already offers — the
 * swipe is just a faster path for a returning user, not a different action.
 * Controlled (`open`/`onOpenChange`) so the parent list keeps only one row
 * open at a time, and closes this one on any tap elsewhere on the page.
 *
 * Three things here are load-bearing, each learned from a real misbehaviour:
 *
 * 1. Move/release listeners live on `document` for the duration of one gesture,
 *    NOT on this element via `setPointerCapture`: with capture, the release can
 *    be delivered somewhere we never hear about (the revealed buttons slide out
 *    from under the finger), leaving the row parked at the drop point.
 * 2. The slide is written straight to the DOM node, and the settle forces a
 *    style flush between "install the transition" and "set the final value" —
 *    a CSS transition only animates a change applied after its own declaration
 *    is committed, so batching both into one frame freezes the row instead.
 * 3. `pointercancel` is NOT a release. The browser fires it when it takes the
 *    gesture over as a scroll, and treating it like a release made every
 *    vertical scroll register as a tap — which opened the detail sheet.
 */
export function SwipeRow({
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onTap,
  children,
  className,
}: Readonly<Props>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const baseX = useRef(0);
  const currentX = useRef(0);
  const draggedOnAxis = useRef(false);
  /** Pointer wandered vertically first: the user is scrolling, not tapping. */
  const scrolling = useRef(false);
  const dragging = useRef(false);
  const { t } = useTranslation();

  const hasActions = Boolean(onEdit || onDelete);

  const setX = useCallback((x: number) => {
    const node = contentRef.current;
    currentX.current = x;
    if (!node) return;
    node.style.transition = "none";
    node.style.transform = `translateX(${x}px)`;
  }, []);

  const settleTo = useCallback((x: number) => {
    // Already resting there: `endGesture` settles immediately and the state
    // round-trip then re-runs the effect below with the same target, so without
    // this the second pass would force a redundant reflow mid-transition.
    if (currentX.current === x) return;
    const node = contentRef.current;
    currentX.current = x;
    if (!node) return;
    node.style.transition = SETTLE_TRANSITION;
    // Forces a style/layout flush so the transition declaration is committed
    // before the value it should animate changes — see the note above. The
    // returned rect is deliberately unused.
    node.getBoundingClientRect();
    node.style.transform = `translateX(${x}px)`;
  }, []);

  // Settle to the position the current `open` state implies, whenever that
  // changes with no gesture in flight (the parent closing this row because
  // another opened, a modal taking over, the initial mount).
  useEffect(() => {
    if (dragging.current) return;
    settleTo(open ? -ACTION_WIDTH : 0);
  }, [open, settleTo]);

  useEffect(() => {
    if (!open) return;
    const onPointerDownOutside = (e: globalThis.PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDownOutside);
    return () => document.removeEventListener("pointerdown", onPointerDownOutside);
  }, [open, onOpenChange]);

  const endGesture = useCallback(
    (cancelled: boolean) => {
      dragging.current = false;

      // Aborted by the browser (it claimed the gesture, typically as a scroll),
      // or the pointer drifted vertically before any horizontal lock: either
      // way this was never a tap and never a swipe. Return to rest silently.
      if (cancelled || (!draggedOnAxis.current && scrolling.current)) {
        settleTo(open ? -ACTION_WIDTH : 0);
        return;
      }

      if (!draggedOnAxis.current) {
        // A real press in place: close an already-open panel rather than
        // opening the detail sheet underneath it.
        if (open) onOpenChange(false);
        else onTap?.();
        return;
      }

      const nextOpen = currentX.current < -ACTION_WIDTH * OPEN_RATIO;
      // Animate here rather than waiting on a state round-trip: an incomplete
      // drag leaves `open` unchanged, so the effect above would never re-run.
      settleTo(nextOpen ? -ACTION_WIDTH : 0);
      if (nextOpen !== open) {
        // Deferred a task: reporting the new state re-renders the whole row
        // list, and doing that synchronously here blocks the main thread before
        // the browser has painted the transition's first frame.
        setTimeout(() => {
          onOpenChange(nextOpen);
        }, 0);
      }
    },
    [open, onOpenChange, onTap, settleTo],
  );

  /**
   * The handler trio actually registered on `document`, captured at attach
   * time. Reading them back off a ref that re-renders overwrite would remove
   * different function identities than were added, leaking a listener set per
   * gesture (`endGesture` gets a new identity whenever the parent re-renders,
   * which it does on every list render).
   */
  const attachedRef = useRef<GestureHandlers | null>(null);

  const detach = useCallback(() => {
    const handlers = attachedRef.current;
    if (!handlers) return;
    attachedRef.current = null;
    document.removeEventListener("pointermove", handlers.move);
    document.removeEventListener("pointerup", handlers.up);
    document.removeEventListener("pointercancel", handlers.cancel);
  }, []);

  // Unmounting mid-gesture must not leave listeners behind.
  useEffect(() => detach, [detach]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!hasActions) return;
    // A press that starts on a control of its own (the revealed actions, the
    // row's "..." menu) belongs to that control: no drag, and no "tap = close
    // / open the detail sheet" either, which would fire alongside its click.
    if ((e.target as HTMLElement).closest("[data-swipe-action]")) return;

    detach();
    startX.current = e.clientX;
    startY.current = e.clientY;
    baseX.current = currentX.current;
    draggedOnAxis.current = false;
    scrolling.current = false;
    dragging.current = true;

    const handlers: GestureHandlers = {
      move: (ev) => {
        if (!dragging.current) return;
        const dx = ev.clientX - startX.current;
        const dy = ev.clientY - startY.current;
        if (!draggedOnAxis.current) {
          // Mostly-vertical movement: leave the gesture to the browser so the
          // list can still scroll, and remember it so the release isn't read
          // as a tap.
          if (Math.abs(dy) > AXIS_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
            scrolling.current = true;
            return;
          }
          if (Math.abs(dx) <= AXIS_LOCK_PX) return;
          draggedOnAxis.current = true;
        }
        setX(Math.min(0, Math.max(-ACTION_WIDTH, baseX.current + dx)));
      },
      up: () => {
        if (!dragging.current) return;
        detach();
        endGesture(false);
      },
      cancel: () => {
        if (!dragging.current) return;
        detach();
        endGesture(true);
      },
    };

    attachedRef.current = handlers;
    document.addEventListener("pointermove", handlers.move);
    document.addEventListener("pointerup", handlers.up);
    document.addEventListener("pointercancel", handlers.cancel);
  }

  /**
   * Runs on the very first click, deliberately with no "was this click part of
   * a drag?" guard. A drag's trailing synthetic click lands on the row content
   * (which travelled with the pointer), never on these buttons — and the
   * content has no click handler at all, since tap-vs-swipe is decided on
   * `pointerup`. A guard here had nothing to catch and instead swallowed the
   * user's real first click, so the actions only fired on the second press.
   */
  function runAction(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative touch-pan-y select-none overflow-hidden", className)}
      onPointerDown={onPointerDown}
    >
      {hasActions ? (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_WIDTH }}>
          {onEdit ? (
            <button
              type="button"
              data-swipe-action
              className="flex w-[72px] flex-col items-center justify-center gap-1 bg-primary text-xs font-medium text-primary-foreground"
              onClick={() => runAction(onEdit)}
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {t("common.edit")}
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              data-swipe-action
              className="flex w-[72px] flex-col items-center justify-center gap-1 bg-destructive text-xs font-medium text-destructive-foreground"
              onClick={() => runAction(onDelete)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("common.delete")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div ref={contentRef} className="relative bg-card will-change-transform">
        {children}
      </div>
    </div>
  );
}
