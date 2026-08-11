import { minWidth } from "../../../../breakpoints";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { Modal, type ModalProps } from "./modal";
import { Window } from "./window";

/** Below `sm` (the phone stage) an overlay is a full-screen window; from `sm`
 * up it is a modal/drawer. Same number as the `sm:`/`max-sm:` classes. */
export const SHEET_QUERY = minWidth("sm");

export interface ResponsiveSurfaceProps extends ModalProps {
  /** Card sizing, modal form only — the window is always the whole viewport. */
  className?: string;
}

/**
 * The default overlay: a `Modal` where there's room for one, a `Window` on a
 * phone. Both render the same chrome, so callers describe the overlay once
 * (title, body, footer) and never branch on width themselves.
 *
 * The choice is a media query rather than CSS classes because the two forms are
 * different *structures*, not the same box restyled — the window has no backdrop
 * to click through, its close control leads instead of trailing, and it must not
 * inherit the modal's `max-h`/translate positioning. Only one of the two is ever
 * mounted.
 */
export function ResponsiveSurface({ className, ...props }: Readonly<ResponsiveSurfaceProps>) {
  const roomForModal = useMediaQuery(SHEET_QUERY);

  return roomForModal ? <Modal className={className} {...props} /> : <Window {...props} />;
}
