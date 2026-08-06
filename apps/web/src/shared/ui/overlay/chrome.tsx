import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export interface SurfaceContent {
  title: string;
  /** Small caps label above the title, naming what kind of surface this is
   * ("Detalle de tarjeta") while the title stays the subject ("CMR Visa"). */
  eyebrow?: string;
  /** Secondary line under the title. */
  description?: string;
  /** Trailing header content — the context the surface was opened from. */
  headerAside?: ReactNode;
  /** Action bar pinned below the scroll area, so it survives a shrinking viewport. */
  footer?: ReactNode;
  /** Leading header control (a back arrow); replaces the close button when set. */
  leading?: ReactNode;
  children: ReactNode;
}

/**
 * The shared skeleton of every overlay in the app: header (title / description /
 * aside / close) → one scrolling body → pinned footer. `Modal` and `Window` both
 * render THIS, which is what makes a dialog recognisable as the same thing
 * whether it came up as a centered card or took over the phone's screen.
 *
 * Slot-agnostic on purpose: the caller owns the body and the footer's buttons,
 * the chrome owns the frame. Wrappers with more opinions (`FormSurface`,
 * `ConfirmModal`) are built on top rather than by adding flags here.
 *
 * The three element roles (`Title`, `Description`, `Close`) are injected instead
 * of imported so the same chrome works under Radix's Dialog (portaled overlays,
 * which need its accessibility primitives) and under a plain route-level screen
 * (no Radix at all — nothing to trap focus into).
 */
export function SurfaceChrome({
  title,
  eyebrow,
  description,
  headerAside,
  footer,
  leading,
  children,
  variant,
  Title,
  Description,
  Close,
  closePlacement,
  className,
}: Readonly<
  SurfaceContent & {
    /** `window` = full-bleed screen; `modal` = padded floating card. */
    variant: "modal" | "window";
    /** Which edge the close control sits on. A window's reads as "back out of
     * this screen" and leads; a modal's or a drawer's is a dismiss and trails. */
    closePlacement?: "start" | "end";
    Title: (p: { className?: string; children: ReactNode }) => ReactNode;
    Description?: (p: { className?: string; children: ReactNode }) => ReactNode;
    /** Omitted on a screen whose only way out is its own back/cancel action. */
    Close?: (p: { className?: string; children: ReactNode; "aria-label": string }) => ReactNode;
    className?: string;
  }
>) {
  const isWindow = variant === "window";
  const closeAtStart = (closePlacement ?? (isWindow ? "start" : "end")) === "start";

  return (
    <div
      className={cn(
        "flex flex-col bg-card",
        isWindow ? "h-full" : "max-h-[90vh] rounded-lg border shadow-lg",
        className,
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-start gap-4",
          isWindow ? "items-center border-b border-border px-4 py-3" : "px-6 pb-4 pt-6",
        )}
      >
        {/* On a window the close control leads (it reads as "back out of this
            screen"); on a modal it trails, where a dismiss belongs. */}
        {leading}
        {Close && closeAtStart && !leading ? (
          <Close className={closeClass} aria-label="Close">
            <X className="h-5 w-5" aria-hidden />
          </Close>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
              {eyebrow}
            </p>
          ) : null}
          <Title className={cn("font-semibold tracking-tight", isWindow ? "text-lg" : "text-xl")}>
            {title}
          </Title>
          {description ? (
            Description ? (
              <Description className="mt-1 text-sm text-muted-foreground">
                {description}
              </Description>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )
          ) : null}
        </div>
        {headerAside ? (
          <div className="shrink-0 self-center truncate text-sm text-muted-foreground">
            {headerAside}
          </div>
        ) : null}
        {Close && !closeAtStart && !leading ? (
          <Close className={closeClass} aria-label="Close">
            <X className="h-5 w-5" aria-hidden />
          </Close>
        ) : null}
      </div>

      <div
        className={cn(
          // `scrollbar-gutter: stable` reserves the scrollbar's track whether or
          // not it's needed: swapping a surface's body between two modes of
          // different heights (a card's detail vs. its form) otherwise gains or
          // loses the scrollbar and shifts all the content sideways.
          "scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]",
          isWindow ? "px-4 pb-4" : "px-6 pb-6",
          footer && "pb-0",
        )}
      >
        {children}
      </div>

      {footer ? (
        <div
          className={cn("shrink-0 border-t border-border bg-card py-4", isWindow ? "px-4" : "px-6")}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

const closeClass =
  "rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
